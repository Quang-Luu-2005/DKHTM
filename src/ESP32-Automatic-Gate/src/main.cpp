#include "MQTT_connect.h"
#include "SystemConfig.h"
#include <Arduino.h>
#include <esp_system.h>

#include "Button.h"
#include "Buzzer.h"
#include "EspNowFace.h"
#include "Gate.h"
#include "Led.h"
#include "RFID.h"
#include "RfidRegistry.h"
#include "Statistic.h"
#include "Ultrasonic.h"

SystemConfig g_config;
Statistic statistic;
RfidRegistry rfidRegistry;

RFID rfid(5, 16);
Gate gate(26);
Led led(33, 32);
Ultrasonic ultra(12, 13);
Buzzer buzzer(21);
Button button(17);

void procedure_open_gate();

namespace {
constexpr unsigned long RFID_AUTHORIZATION_TIMEOUT_MS = 7000;
constexpr unsigned long RFID_ENROLLMENT_WINDOW_MS = 30000;
constexpr unsigned long FACE_SCAN_TIMEOUT_MS = 6000;
constexpr unsigned long FACE_RETRY_DELAY_MS = 750;
constexpr unsigned long FACE_ENROLLMENT_TIMEOUT_MS = 70000;
constexpr unsigned long ESP_NOW_RETRY_INTERVAL_MS = 2000;
constexpr unsigned long FACE_PRESENCE_TIMEOUT_MS = 3500;
constexpr unsigned long PRESENCE_SAMPLE_INTERVAL_MS = 100;
constexpr uint8_t PRESENCE_REQUIRED_SAMPLES = 3;
constexpr uint8_t ABSENCE_REQUIRED_SAMPLES = 5;
constexpr uint8_t MAX_AUTHENTICATION_FAILURES = 3;

enum class AuthenticationMethod : uint8_t { NONE, RFID, FACE, MIXED };

bool rfidAuthorizationPending = false;
String pendingRfidUid;
unsigned long rfidAuthorizationStartedAt = 0;
unsigned long rfidEnrollmentExpiresAt = 0;
String lastProcessedFaceRequestId;

bool authenticationSessionActive = false;
bool authenticationAlertSent = false;
bool gateViolationAlertSent = false;
uint8_t failedAuthenticationAttempts = 0;
uint8_t presenceSamples = 0;
uint8_t absenceSamples = 0;
unsigned long lastPresenceSampleAt = 0;
unsigned long lastFacePresenceAt = 0;
AuthenticationMethod failedMethod = AuthenticationMethod::NONE;
uint32_t authenticationSessionId = 0;
uint32_t nextAuthenticationSessionId = 0;
uint32_t activeFaceSequence = 0;
bool faceScanPending = false;
bool faceScanScheduled = false;
uint8_t faceScanAttempt = 0;
unsigned long faceScanStartedAt = 0;
unsigned long nextFaceScanAt = 0;
unsigned long lastEspNowSetupAttemptAt = 0;
bool faceEnrollmentPending = false;
uint32_t faceEnrollmentSequence = 0;
unsigned long faceEnrollmentStartedAt = 0;
String faceEnrollmentEmployeeId;

void maintain_esp_now_transport() {
  if (esp_now_face_ready() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastEspNowSetupAttemptAt < ESP_NOW_RETRY_INTERVAL_MS) return;
  lastEspNowSetupAttemptAt = millis();
  esp_now_face_setup();
}

void cancel_face_scan() {
  faceScanPending = false;
  faceScanScheduled = false;
  activeFaceSequence = 0;
  faceScanStartedAt = 0;
}

void schedule_face_scan(unsigned long delayMs) {
  if (!authenticationSessionActive || authenticationAlertSent ||
      g_config.system_state != state_normal || gate.state != GATE_CLOSED) {
    return;
  }
  faceScanScheduled = true;
  nextFaceScanAt = millis() + delayMs;
}

void clear_rfid_authorization() {
  rfidAuthorizationPending = false;
  pendingRfidUid = "";
  rfidAuthorizationStartedAt = 0;
}

void reset_authentication_session() {
  clear_rfid_authorization();
  cancel_face_scan();
  authenticationSessionActive = false;
  authenticationSessionId = 0;
  authenticationAlertSent = false;
  failedAuthenticationAttempts = 0;
  failedMethod = AuthenticationMethod::NONE;
  presenceSamples = 0;
  absenceSamples = 0;
  lastFacePresenceAt = 0;
}

const char *method_name(AuthenticationMethod method) {
  switch (method) {
  case AuthenticationMethod::RFID: return "RFID";
  case AuthenticationMethod::FACE: return "FACE";
  case AuthenticationMethod::MIXED: return "MIXED";
  default: return "UNKNOWN";
  }
}

void clear_failed_attempts() {
  failedAuthenticationAttempts = 0;
  failedMethod = AuthenticationMethod::NONE;
  authenticationAlertSent = false;
}

void start_authentication_session(bool requestFaceScan, const char *trigger) {
  if (authenticationSessionActive) return;
  authenticationSessionActive = true;
  if (++nextAuthenticationSessionId == 0) ++nextAuthenticationSessionId;
  authenticationSessionId = nextAuthenticationSessionId;
  failedAuthenticationAttempts = 0;
  failedMethod = AuthenticationMethod::NONE;
  authenticationAlertSent = false;
  faceScanAttempt = 0;
  lastFacePresenceAt = millis();
  Serial.printf("Authentication session started|session=%lu|trigger=%s\n",
                static_cast<unsigned long>(authenticationSessionId), trigger);
  mqtt_upload_status("authentication_session_started");
  if (requestFaceScan) schedule_face_scan(0);
}

const char *face_retry_reason(sentinel_now::FaceResult result) {
  switch (result) {
  case sentinel_now::FaceResult::NO_FACE: return "no_face";
  case sentinel_now::FaceResult::MULTIPLE_FACES: return "multiple_faces";
  case sentinel_now::FaceResult::FACE_TOO_SMALL: return "face_too_small";
  case sentinel_now::FaceResult::CAMERA_ERROR: return "camera_error";
  case sentinel_now::FaceResult::BUSY: return "camera_busy";
  default: return "face_result_invalid";
  }
}

void register_authentication_failure(AuthenticationMethod method) {
  if (!authenticationSessionActive || authenticationAlertSent) return;

  if (failedMethod == AuthenticationMethod::NONE) {
    failedMethod = method;
  } else if (failedMethod != method) {
    failedMethod = AuthenticationMethod::MIXED;
  }

  if (failedAuthenticationAttempts < MAX_AUTHENTICATION_FAILURES) {
    failedAuthenticationAttempts++;
  }

  if (failedAuthenticationAttempts < MAX_AUTHENTICATION_FAILURES) return;

  authenticationAlertSent = true;
  statistic.authenticationAlerts++;
  gate.close();
  gate.state = GATE_CLOSED;
  led.light_red();
  buzzer.start_siren();

  const char *alertType = "REPEATED_AUTH_FAILURE";
  if (failedMethod == AuthenticationMethod::FACE) {
    alertType = "REPEATED_UNKNOWN_FACE";
  } else if (failedMethod == AuthenticationMethod::RFID) {
    alertType = "REPEATED_INVALID_RFID";
  }
  mqtt_upload_authentication_alert(
      alertType, method_name(failedMethod), failedAuthenticationAttempts);
  Serial.println("Authentication alert sent; waiting for subject to leave");
}

bool is_countable_face_failure(const String &reason) {
  return reason == "face_not_matched" || reason == "unknown_face";
}

void process_stream_face_presence() {
  sentinel_now::Message presence = {};
  if (!esp_now_face_take_presence(presence)) return;
  if (faceEnrollmentPending ||
      g_config.system_state != state_normal || gate.state != GATE_CLOSED) {
    return;
  }

  lastFacePresenceAt = millis();
  if (!authenticationSessionActive) {
    start_authentication_session(true, "stream_face_detector");
  } else if (!authenticationAlertSent && !faceScanPending &&
             !faceScanScheduled && !rfidAuthorizationPending) {
    schedule_face_scan(0);
  }
}

void update_authentication_session_timeout() {
  if (!authenticationSessionActive || lastFacePresenceAt == 0) return;
  if (millis() - lastFacePresenceAt < FACE_PRESENCE_TIMEOUT_MS) return;
  Serial.println("Authentication session ended|reason=face_presence_timeout");
  reset_authentication_session();
  mqtt_upload_status("authentication_session_ended");
}

void update_gate_violation_detection() {
  if (gate.state == GATE_OPEN || g_config.system_state == state_always_open) {
    presenceSamples = 0;
    absenceSamples = 0;
    gateViolationAlertSent = false;
    return;
  }
  if (millis() - lastPresenceSampleAt < PRESENCE_SAMPLE_INTERVAL_MS) return;
  lastPresenceSampleAt = millis();

  const int distanceCm = ultra.get_distance();
  const bool violationSignal = distanceCm > 0 && distanceCm <= 10;
  if (violationSignal) {
    absenceSamples = 0;
    if (presenceSamples < PRESENCE_REQUIRED_SAMPLES) presenceSamples++;
    if (!gateViolationAlertSent &&
        presenceSamples >= PRESENCE_REQUIRED_SAMPLES) {
      gateViolationAlertSent = true;
      statistic.authenticationAlerts++;
      buzzer.start_siren();
      mqtt_upload_gate_climb_violation(distanceCm);
      Serial.printf("Gate climb violation published|distance_cm=%d\n", distanceCm);
    }
    return;
  }

  presenceSamples = 0;
  if (!gateViolationAlertSent) return;
  if (absenceSamples < ABSENCE_REQUIRED_SAMPLES) absenceSamples++;
  if (absenceSamples >= ABSENCE_REQUIRED_SAMPLES) {
    gateViolationAlertSent = false;
    absenceSamples = 0;
    Serial.println("Gate violation sensor cleared; alert rearmed");
  }
}

void process_esp_now_face_result() {
  sentinel_now::Message result = {};
  if (!esp_now_face_take_result(result)) return;

  if (result.type == sentinel_now::MessageType::ENROLL_PROGRESS ||
      result.type == sentinel_now::MessageType::ENROLL_RESULT) {
    if (!faceEnrollmentPending ||
        result.sequence != faceEnrollmentSequence ||
        !faceEnrollmentEmployeeId.equalsIgnoreCase(result.employeeId)) {
      Serial.println("Ignored stale ESP-NOW enrollment result");
      return;
    }

    if (result.type == sentinel_now::MessageType::ENROLL_PROGRESS) {
      mqtt_upload_face_enrollment("PROGRESS", result.employeeId,
                                  result.reason, result.attempt, "");
      Serial.printf("Face enrollment progress|employee=%s|view=%s|completed=%u\n",
                    result.employeeId, result.reason, result.attempt);
      return;
    }

    const bool success = result.result == sentinel_now::FaceResult::VERIFIED;
    mqtt_upload_face_enrollment(success ? "SUCCESS" : "FAILED",
                                result.employeeId, "", result.attempt,
                                result.reason);
    Serial.printf("Face enrollment finished|employee=%s|status=%s|reason=%s\n",
                  result.employeeId, success ? "SUCCESS" : "FAILED",
                  result.reason);
    faceEnrollmentPending = false;
    faceEnrollmentSequence = 0;
    faceEnrollmentStartedAt = 0;
    faceEnrollmentEmployeeId = "";
    return;
  }

  Serial.printf(
      "ESP-NOW SCAN_RESULT|session=%lu|sequence=%lu|result=%s|employee=%s|similarity=%.4f\n",
      static_cast<unsigned long>(result.sessionId),
      static_cast<unsigned long>(result.sequence),
      sentinel_now::resultName(result.result), result.employeeId,
      result.similarity);

  if (!authenticationSessionActive || result.sessionId != authenticationSessionId ||
      !faceScanPending || result.sequence != activeFaceSequence ||
      g_config.system_state != state_normal || gate.state != GATE_CLOSED ||
      authenticationAlertSent) {
    Serial.println("Ignored stale ESP-NOW face result");
    return;
  }

  faceScanPending = false;
  activeFaceSequence = 0;

  if (result.result == sentinel_now::FaceResult::VERIFIED) {
    clear_rfid_authorization();
    clear_failed_attempts();
    statistic.normal++;
    mqtt_upload_face_granted(result.employeeId, result.employeeId,
                             result.similarity);
    cancel_face_scan();
    procedure_open_gate();
    return;
  }

  gate.close();
  gate.state = GATE_CLOSED;
  led.light_red();

  if (result.result == sentinel_now::FaceResult::UNKNOWN) {
    register_authentication_failure(AuthenticationMethod::FACE);
    buzzer.reject_three_beeps();
    mqtt_upload_face_denied("unknown_face", result.similarity,
                            failedAuthenticationAttempts, true);
    if (!authenticationAlertSent) schedule_face_scan(FACE_RETRY_DELAY_MS);
    return;
  }

  const char *reason = face_retry_reason(result.result);
  mqtt_upload_face_denied(reason, result.similarity,
                          failedAuthenticationAttempts, false);
  Serial.printf("Camera retry without failure count: %s\n", reason);
  schedule_face_scan(FACE_RETRY_DELAY_MS);
}

void update_face_scan() {
  if (!authenticationSessionActive || authenticationAlertSent ||
      g_config.system_state != state_normal || gate.state != GATE_CLOSED) {
    cancel_face_scan();
    return;
  }

  if (faceScanPending) {
    if (millis() - faceScanStartedAt < FACE_SCAN_TIMEOUT_MS) return;
    Serial.printf("ESP-NOW face timeout|session=%lu|sequence=%lu\n",
                  static_cast<unsigned long>(authenticationSessionId),
                  static_cast<unsigned long>(activeFaceSequence));
    faceScanPending = false;
    activeFaceSequence = 0;
    mqtt_upload_face_denied("camera_timeout", 0.0f,
                            failedAuthenticationAttempts, false);
    schedule_face_scan(FACE_RETRY_DELAY_MS);
    return;
  }

  if (!faceScanScheduled ||
      static_cast<long>(millis() - nextFaceScanAt) < 0) {
    return;
  }
  faceScanScheduled = false;
  if (faceScanAttempt < UINT8_MAX) ++faceScanAttempt;
  if (esp_now_face_request(authenticationSessionId, faceScanAttempt,
                           activeFaceSequence)) {
    faceScanPending = true;
    faceScanStartedAt = millis();
  } else {
    mqtt_upload_face_denied("camera_transport_unavailable", 0.0f,
                            failedAuthenticationAttempts, false);
    schedule_face_scan(FACE_RETRY_DELAY_MS);
  }
}
} // namespace

void process_mqtt_command();

void setup() {
  Serial.begin(115200);
  rfid.init();
  gate.init();
  ultra.init();
  buzzer.init();
  button.init();
  led.init();
  rfidRegistry.begin();

  Serial.println("ESP32 SERIAL OK");
  g_config.normal_run();
  gate.close();
  led.light_red();
  mqtt_setup();
  nextAuthenticationSessionId = esp_random();
  esp_now_face_setup();
}

void procedure_open_gate() {
  buzzer.low_pitch(300);
  gate.open();
  led.light_green();
  gate.state = GATE_OPEN;
  gate.timer = millis();
  delay(1000);
}

void procedure_close_gate() {
  const bool wasOpen = gate.state == GATE_OPEN;
  gate.close();
  led.light_red();
  gate.state = GATE_CLOSED;
  if (wasOpen) mqtt_upload_status("closed");
}

void process_mqtt_command() {
  const MQTTCommand command = mqttPendingCommand;
  if (command == MQTT_COMMAND_NONE) return;
  mqttPendingCommand = MQTT_COMMAND_NONE;

  switch (command) {
  case MQTT_COMMAND_OPEN:
    reset_authentication_session();
    g_config.always_open_run();
    gate.open();
    led.light_green();
    buzzer.no_sound();
    gate.state = GATE_OPEN;
    gate.timer = millis();
    mqtt_upload_status("opened");
    break;

  case MQTT_COMMAND_CLOSE:
    reset_authentication_session();
    g_config.always_close_run();
    gate.close();
    led.light_red();
    buzzer.no_sound();
    gate.state = GATE_CLOSED;
    mqtt_upload_status("closed");
    break;

  case MQTT_COMMAND_NORMAL:
    reset_authentication_session();
    g_config.normal_run();
    gate.close();
    led.light_red();
    buzzer.no_sound();
    gate.state = GATE_CLOSED;
    mqtt_upload_status("normal");
    break;

  case MQTT_COMMAND_LED_GREEN:
    led.light_green();
    mqtt_upload_status("led_green");
    break;
  case MQTT_COMMAND_LED_RED:
    led.light_red();
    mqtt_upload_status("led_red");
    break;
  case MQTT_COMMAND_BUZZER_ON:
    buzzer.alarm_on();
    mqtt_upload_status("buzzer_active");
    break;
  case MQTT_COMMAND_BUZZER_OFF:
    buzzer.no_sound();
    mqtt_upload_status("buzzer_muted");
    break;

  case MQTT_COMMAND_RFID_ENROLLMENT_START:
    rfidEnrollmentExpiresAt = millis() + RFID_ENROLLMENT_WINDOW_MS;
    Serial.println("RFID enrollment window opened for 30 seconds");
    break;

  case MQTT_COMMAND_FACE_ENROLLMENT_START: {
    const String employeeId = mqttFaceEnrollmentEmployeeId;
    if (employeeId.length() == 0 || employeeId.length() > 24) {
      mqtt_upload_face_enrollment("FAILED", employeeId.c_str(), "", 0,
                                  "INVALID_EMPLOYEE_ID");
      break;
    }
    if (faceEnrollmentPending) {
      mqtt_upload_face_enrollment("FAILED", employeeId.c_str(), "", 0,
                                  "ENROLLMENT_BUSY");
      break;
    }

    reset_authentication_session();
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();
    buzzer.no_sound();
    if (!esp_now_face_enrollment_request(employeeId.c_str(),
                                         faceEnrollmentSequence)) {
      mqtt_upload_face_enrollment("FAILED", employeeId.c_str(), "", 0,
                                  "CAMERA_TRANSPORT_UNAVAILABLE");
      faceEnrollmentSequence = 0;
      break;
    }
    faceEnrollmentPending = true;
    faceEnrollmentStartedAt = millis();
    faceEnrollmentEmployeeId = employeeId;
    mqtt_upload_face_enrollment("STARTED", employeeId.c_str(), "FRONT", 0,
                                "");
  } break;

  case MQTT_COMMAND_RFID_GRANTED: {
    if (!rfidAuthorizationPending ||
        !pendingRfidUid.equalsIgnoreCase(mqttRfidUid) ||
        g_config.system_state != state_normal ||
        !authenticationSessionActive) {
      Serial.println("Ignored stale RFID grant response");
      break;
    }
    const String approvedUid = pendingRfidUid;
    clear_rfid_authorization();
    clear_failed_attempts();
    statistic.normal++;
    mqtt_upload_granted(approvedUid.c_str(), mqttEmployeeId, mqttEmployeeName);
    procedure_open_gate();
  } break;

  case MQTT_COMMAND_RFID_DENIED: {
    if (!rfidAuthorizationPending ||
        !pendingRfidUid.equalsIgnoreCase(mqttRfidUid)) {
      Serial.println("Ignored stale RFID deny response");
      break;
    }
    const String deniedUid = pendingRfidUid;
    const bool silent = mqttRfidSilent;
    const String reason = mqttRfidReason;
    clear_rfid_authorization();
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();

    if (silent) {
      Serial.println("RFID captured for enrollment");
    } else if (authenticationSessionActive) {
      register_authentication_failure(AuthenticationMethod::RFID);
      buzzer.reject_three_beeps();
      mqtt_upload_denied(deniedUid.c_str(), reason.c_str(),
                         failedAuthenticationAttempts, true);
    }
  } break;

  case MQTT_COMMAND_FACE_GRANTED: {
    const String requestId = mqttFaceRequestId;
    if (requestId.length() == 0 || requestId == lastProcessedFaceRequestId ||
        g_config.system_state != state_normal || !authenticationSessionActive ||
        authenticationAlertSent ||
        gate.state != GATE_CLOSED || rfidAuthorizationPending) {
      Serial.println("Ignored stale face grant response");
      break;
    }
    lastProcessedFaceRequestId = requestId;
    clear_failed_attempts();
    statistic.normal++;
    mqtt_upload_face_granted(mqttEmployeeId, mqttEmployeeName, mqttFaceConfidence);
    procedure_open_gate();
  } break;

  case MQTT_COMMAND_FACE_DENIED: {
    const String requestId = mqttFaceRequestId;
    if (requestId.length() == 0 || requestId == lastProcessedFaceRequestId ||
        g_config.system_state != state_normal || !authenticationSessionActive ||
        authenticationAlertSent ||
        gate.state != GATE_CLOSED || rfidAuthorizationPending) {
      Serial.println("Ignored stale face result");
      break;
    }
    lastProcessedFaceRequestId = requestId;
    const String reason = mqttRfidReason;
    const bool counted = is_countable_face_failure(reason);
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();
    if (counted) {
      register_authentication_failure(AuthenticationMethod::FACE);
      buzzer.reject_three_beeps();
    } else {
      Serial.print("Camera retry without failure count: ");
      Serial.println(reason);
    }
    mqtt_upload_face_denied(reason.c_str(), mqttFaceConfidence,
                            failedAuthenticationAttempts, counted);
  } break;

  default:
    break;
  }
}

void loop() {
  buzzer.update_siren();
  mqtt_loop(!authenticationSessionActive);
  maintain_esp_now_transport();
  process_mqtt_command();
  process_stream_face_presence();
  update_authentication_session_timeout();
  update_gate_violation_detection();
  process_esp_now_face_result();
  update_face_scan();

  // Nút Reset Phiên Làm Việc Mới (New Session Reset):
  if (button.is_pressed()) {
    Serial.println("NEW_SESSION_BUTTON|PRESSED|Resetting old state & starting fresh session");
    buzzer.is_siren_active = false;
    buzzer.no_sound();
    clear_rfid_authorization();
    clear_failed_attempts();
    cancel_face_scan();
    authenticationAlertSent = false;
    gateViolationAlertSent = false;
    g_config.system_state = state_normal;
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();

    // Bắt đầu một phiên xác thực hoàn toàn mới
    start_authentication_session(false, "manual_button_reset");
    buzzer.high_pitch(120);
  }

  if (faceEnrollmentPending &&
      millis() - faceEnrollmentStartedAt >= FACE_ENROLLMENT_TIMEOUT_MS) {
    mqtt_upload_face_enrollment("FAILED", faceEnrollmentEmployeeId.c_str(),
                                "", 0, "CAMERA_TIMEOUT");
    Serial.printf("Face enrollment timeout|employee=%s|sequence=%lu\n",
                  faceEnrollmentEmployeeId.c_str(),
                  static_cast<unsigned long>(faceEnrollmentSequence));
    faceEnrollmentPending = false;
    faceEnrollmentSequence = 0;
    faceEnrollmentStartedAt = 0;
    faceEnrollmentEmployeeId = "";
  }

  if (rfidAuthorizationPending &&
      millis() - rfidAuthorizationStartedAt >= RFID_AUTHORIZATION_TIMEOUT_MS) {
    const String timedOutUid = pendingRfidUid;
    clear_rfid_authorization();
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();
    mqtt_upload_denied(timedOutUid.c_str(), "authorization_timeout",
                       failedAuthenticationAttempts, false);
  }

  switch (g_config.system_state) {
  case state_normal:
    if (gate.state == GATE_CLOSED && !authenticationAlertSent &&
        !rfidAuthorizationPending && rfid.is_read()) {
      if (!authenticationSessionActive) {
        start_authentication_session(false, "rfid");
      }
      lastFacePresenceAt = millis();
      const Card card = rfid.get_ID();
      card.print_id();
      const String scannedUid = card.to_string();
      mqtt_request_rfid_auth(scannedUid.c_str());

      if (static_cast<long>(rfidEnrollmentExpiresAt - millis()) > 0) {
        Serial.printf("RFID enrollment scan published|uid=%s\n", scannedUid.c_str());
        buzzer.high_pitch(100);
        break;
      }

      RfidIdentity identity = {};
      if (rfidRegistry.find(scannedUid, identity)) {
        clear_rfid_authorization();
        clear_failed_attempts();
        cancel_face_scan();
        statistic.normal++;
        mqtt_upload_granted(scannedUid.c_str(), identity.employeeId,
                            identity.employeeName);
        Serial.printf("RFID local grant|uid=%s|employee=%s\n",
                      scannedUid.c_str(), identity.employeeId);
        procedure_open_gate();
      } else {
        gate.close();
        gate.state = GATE_CLOSED;
        led.light_red();
        register_authentication_failure(AuthenticationMethod::RFID);
        buzzer.reject_three_beeps();
        mqtt_upload_denied(scannedUid.c_str(), "not_registered",
                           failedAuthenticationAttempts, true);
        Serial.printf("RFID local deny|uid=%s|attempt=%u\n",
                      scannedUid.c_str(), failedAuthenticationAttempts);
      }
    }
    if (gate.state == GATE_OPEN && millis() - gate.timer >= 1500) {
      procedure_close_gate();
    }
    break;

  case state_always_open:
    gate.open();
    led.light_green();
    gate.state = GATE_OPEN;
    break;

  case state_always_close:
    gate.close();
    led.light_red();
    buzzer.no_sound();
    gate.state = GATE_CLOSED;
    break;

  default:
    break;
  }

  if (button.is_pressed() && g_config.system_state != state_normal) {
    reset_authentication_session();
    g_config.normal_run();
    gate.close();
    led.light_red();
    buzzer.no_sound();
    gate.state = GATE_CLOSED;
    mqtt_upload_status("normal");
  }
}
