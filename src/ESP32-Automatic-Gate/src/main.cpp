#include "MQTT_connect.h"
#include "SystemConfig.h"
#include <Arduino.h>

#include "Button.h"
#include "Buzzer.h"
#include "Gate.h"
#include "Led.h"
#include "RFID.h"
#include "Statistic.h"
#include "Ultrasonic.h"

SystemConfig g_config;
Statistic statistic;

RFID rfid(5, 16);
Gate gate(26);
Led led(33, 32);
Ultrasonic ultra(12, 13);
Buzzer buzzer(21);
Button button(17);

bool rfidAuthorizationPending = false;
String pendingRfidUid;
unsigned long rfidAuthorizationStartedAt = 0;
const unsigned long RFID_AUTHORIZATION_TIMEOUT_MS = 7000;
const unsigned long NORMAL_VIOLATION_GUARD_MS = 2000;
const uint8_t NORMAL_VIOLATION_REQUIRED_SAMPLES = 3;
String lastProcessedFaceRequestId;
unsigned long normalViolationGuardStartedAt = 0;
uint8_t normalViolationSamples = 0;

void process_mqtt_command();

void clear_rfid_authorization() {
  rfidAuthorizationPending = false;
  pendingRfidUid = "";
  rfidAuthorizationStartedAt = 0;
}

void start_normal_violation_guard() {
  normalViolationGuardStartedAt = millis();
  normalViolationSamples = 0;
}

bool normal_violation_guard_active() {
  return millis() - normalViolationGuardStartedAt < NORMAL_VIOLATION_GUARD_MS;
}

void activate_violation(const char *source) {
  if (g_config.violation) return;

  clear_rfid_authorization();
  normalViolationSamples = 0;
  statistic.violator++;
  g_config.violation = true;
  gate.close();
  gate.state = GATE_CLOSED;
  led.light_red();
  buzzer.alarm_on();
  Serial.print("Violation detected: ");
  Serial.println(source);
  mqtt_upload_violate();
}

void setup() {
  Serial.begin(115200);
  rfid.init();
  gate.init();
  ultra.init();
  buzzer.init();
  button.init();
  led.init();

  Serial.println("ESP32 SERIAL OK");
  g_config.normal_run();
  gate.close();
  start_normal_violation_guard();
  mqtt_setup();
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
  bool wasOpen = gate.state == GATE_OPEN;
  gate.close();
  led.light_red();
  gate.state = GATE_CLOSED;
  if (wasOpen) {
    if (g_config.system_state == state_normal) start_normal_violation_guard();
    mqtt_upload_status("closed");
  }
}

void process_mqtt_command() {
  MQTTCommand command = mqttPendingCommand;
  if (command == MQTT_COMMAND_NONE) return;
  mqttPendingCommand = MQTT_COMMAND_NONE;

  switch (command) {
  case MQTT_COMMAND_OPEN:
    clear_rfid_authorization();
    g_config.violation = false;
    g_config.always_open_run();
    gate.open();
    led.light_green();
    buzzer.no_sound();
    gate.state = GATE_OPEN;
    gate.timer = millis();
    mqtt_upload_status("opened");
    break;

  case MQTT_COMMAND_CLOSE:
    clear_rfid_authorization();
    g_config.always_close_run();
    gate.close();
    led.light_red();
    if (!g_config.violation) buzzer.no_sound();
    gate.state = GATE_CLOSED;
    mqtt_upload_status("closed");
    break;

  case MQTT_COMMAND_NORMAL:
    clear_rfid_authorization();
    g_config.normal_run();
    gate.close();
    led.light_red();
    buzzer.no_sound();
    gate.state = GATE_CLOSED;
    start_normal_violation_guard();
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
    if (g_config.violation) {
      buzzer.alarm_on();
      mqtt_upload_status("buzzer_active");
    } else {
      buzzer.no_sound();
      mqtt_upload_status("buzzer_muted");
    }
    break;

  case MQTT_COMMAND_RESET_VIOLATION:
    g_config.violation = false;
    buzzer.no_sound();
    start_normal_violation_guard();
    mqtt_upload_status("violation_reset");
    break;

  case MQTT_COMMAND_RFID_GRANTED: {
    if (!rfidAuthorizationPending ||
        !pendingRfidUid.equalsIgnoreCase(mqttRfidUid) ||
        g_config.system_state != state_normal ||
        g_config.violation) {
      Serial.println("Ignored stale RFID grant response");
      break;
    }

    String approvedUid = pendingRfidUid;
    clear_rfid_authorization();
    statistic.normal++;
    Serial.print("RFID authorized: ");
    Serial.print(approvedUid);
    Serial.print(" - ");
    Serial.println(mqttEmployeeName);
    mqtt_upload_granted(approvedUid.c_str(), mqttEmployeeId, mqttEmployeeName);
    procedure_open_gate();
  } break;

  case MQTT_COMMAND_RFID_DENIED: {
    if (!rfidAuthorizationPending ||
        !pendingRfidUid.equalsIgnoreCase(mqttRfidUid)) {
      Serial.println("Ignored stale RFID deny response");
      break;
    }

    String deniedUid = pendingRfidUid;
    bool silent = mqttRfidSilent;
    String reason = mqttRfidReason;
    clear_rfid_authorization();
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();

    if (silent) {
      Serial.print("RFID captured for enrollment: ");
      Serial.println(deniedUid);
    } else {
      Serial.print("RFID denied: ");
      Serial.println(deniedUid);
      buzzer.reject_three_beeps();
      mqtt_upload_denied(deniedUid.c_str(), reason.c_str());
    }
  } break;

  case MQTT_COMMAND_FACE_GRANTED: {
    String requestId = mqttFaceRequestId;
    if (requestId.length() == 0 ||
        requestId == lastProcessedFaceRequestId ||
        g_config.system_state != state_normal ||
        g_config.violation ||
        gate.state != GATE_CLOSED ||
        rfidAuthorizationPending) {
      Serial.println("Ignored stale face grant response");
      break;
    }

    lastProcessedFaceRequestId = requestId;
    statistic.normal++;
    Serial.print("Face authorized: ");
    Serial.println(mqttEmployeeName);
    mqtt_upload_face_granted(mqttEmployeeId, mqttEmployeeName, mqttFaceConfidence);
    procedure_open_gate();
  } break;

  case MQTT_COMMAND_FACE_DENIED: {
    String requestId = mqttFaceRequestId;
    if (requestId.length() == 0 ||
        requestId == lastProcessedFaceRequestId ||
        g_config.system_state != state_normal ||
        g_config.violation ||
        gate.state != GATE_CLOSED ||
        rfidAuthorizationPending) {
      Serial.println("Ignored stale face deny response");
      break;
    }

    lastProcessedFaceRequestId = requestId;
    String reason = mqttRfidReason;
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();
    Serial.print("Face denied: ");
    Serial.println(reason);
    buzzer.reject_three_beeps();
    mqtt_upload_face_denied(reason.c_str(), mqttFaceConfidence);
  } break;

  default:
    break;
  }
}

void loop() {
  mqtt_loop();
  process_mqtt_command();

  if (rfidAuthorizationPending &&
      millis() - rfidAuthorizationStartedAt >= RFID_AUTHORIZATION_TIMEOUT_MS) {
    String timedOutUid = pendingRfidUid;
    clear_rfid_authorization();
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();
    buzzer.reject_three_beeps();
    mqtt_upload_denied(timedOutUid.c_str(), "authorization_timeout");
  }

  if (g_config.violation) {
    gate.close();
    gate.state = GATE_CLOSED;
    led.light_red();
    buzzer.alarm_on();
    if (button.is_pressed()) {
      g_config.normal_run();
      buzzer.no_sound();
      start_normal_violation_guard();
      mqtt_upload_status("violation_reset");
    }
  } else {
    switch (g_config.system_state) {
    case state_normal: {
      if (rfid.is_read()) {
        if (gate.state == GATE_CLOSED && !rfidAuthorizationPending) {
          Card card = rfid.get_ID();
          card.print_id();
          String cardUid = card.to_string();
          pendingRfidUid = cardUid;
          rfidAuthorizationPending = true;
          rfidAuthorizationStartedAt = millis();
          Serial.println("Checking RFID with Sentinel database...");

          if (!mqtt_request_rfid_auth(cardUid.c_str())) {
            clear_rfid_authorization();
            led.light_red();
            buzzer.reject_three_beeps();
            mqtt_upload_denied(cardUid.c_str(), "request_publish_failed");
          }
        }
      } else {
        if (gate.state == GATE_OPEN && millis() - gate.timer >= 1500) {
          procedure_close_gate();
        }

        const bool canDetectUnauthorizedPassage =
            gate.state == GATE_CLOSED &&
            !rfidAuthorizationPending &&
            !normal_violation_guard_active();

        if (canDetectUnauthorizedPassage && ultra.is_violate()) {
          if (normalViolationSamples < NORMAL_VIOLATION_REQUIRED_SAMPLES) {
            normalViolationSamples++;
          }
          if (normalViolationSamples >= NORMAL_VIOLATION_REQUIRED_SAMPLES) {
            activate_violation("normal_closed_gate");
          }
        } else {
          normalViolationSamples = 0;
        }
      }
    } break;

    case state_always_open: {
      Serial.println("Always open");
      gate.open();
      led.light_green();
      gate.state = GATE_OPEN;
    } break;

    case state_always_close: {
      Serial.println("Always close");
      gate.close();
      // led.no_light();
      led.light_red();
      gate.state = GATE_CLOSED;
      if (ultra.is_violate()) {
        activate_violation("forced_lock");
      }
    } break;

    default:
      break;
    }
  }
}
