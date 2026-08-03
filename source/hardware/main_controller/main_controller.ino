#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>

#include "backend_client.h"
#include "config.h"
#include "gate_actuator.h"
#include "rfid_reader.h"
#include "safety_button.h"
#include "status_indicators.h"
#include "ultrasonic_sensor.h"

using namespace ControllerConfig;
namespace Pins = HardwarePins::MainController;

WebServer webServer(80);
GateActuator gate(Pins::kServo, kLockedAngle, kUnlockedAngle);
StatusIndicators indicators(Pins::kRedLed, Pins::kGreenLed, Pins::kBuzzer);
RfidReader rfid(Pins::kRfidSs, Pins::kRfidReset);
UltrasonicSensor ultrasonic(Pins::kUltrasonicTrigger, Pins::kUltrasonicEcho);
SafetyButton safetyButton(Pins::kSafetyButton);
ControllerBackendClient backend(kBackendBaseUrl, kDeviceSecret, kDeviceId, kGateId);

unsigned long lastSensorPollAt = 0;
unsigned long lastPresenceEventAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastWifiAttemptAt = 0;
bool serverRoutesRegistered = false;

String controllerHardwareEventJson() {
  String payload;
  payload.reserve(220);
  payload += "\"hardware\":{";
  payload += "\"servoLocked\":";
  payload += gate.isLocked() ? "true" : "false";
  payload += ",\"servoArm\":\"" + String(gate.armState()) + "\"";
  payload += ",\"indicatorLed\":\"" + String(indicators.ledState()) + "\"";
  payload += ",\"systemBuzzer\":\"";
  payload += indicators.buzzerActive() ? "ACTIVE" : "MUTED";
  payload += "\",\"rfidReady\":true,\"ultrasonicReady\":true}";
  return payload;
}

void sendCors() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Headers", "Content-Type, x-device-secret");
  webServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

bool controllerSecretMatches() {
  const String supplied = webServer.header("x-device-secret");
  const size_t expectedLength = strlen(kDeviceSecret);
  if (supplied.length() != expectedLength) return false;

  uint8_t difference = 0;
  for (size_t index = 0; index < expectedLength; ++index) {
    difference |= static_cast<uint8_t>(supplied[index] ^ kDeviceSecret[index]);
  }
  return difference == 0;
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(kWifiSsid, kWifiPass);
  Serial.print("Connecting WiFi");
  for (int retry = 0; retry < kWifiMaxRetries && WiFi.status() != WL_CONNECTED; retry++) {
    delay(kWifiRetryDelayMs);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Controller IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("WiFi unavailable; local safety functions remain active.");
  return false;
}

void sendControllerStatus(const String& commandId = "") {
  JsonDocument document;
  document["ok"] = true;
  if (!commandId.isEmpty()) {
    document["commandId"] = commandId;
  }
  document["online"] = true;
  document["servoLocked"] = gate.isLocked();
  document["servoArm"] = gate.armState();
  document["indicatorLed"] = indicators.ledState();
  document["systemBuzzer"] = indicators.buzzerActive() ? "ACTIVE" : "MUTED";

  JsonObject hardware = document["hardware"].to<JsonObject>();
  hardware["servoLocked"] = gate.isLocked();
  hardware["servoArm"] = gate.armState();
  hardware["indicatorLed"] = indicators.ledState();
  hardware["systemBuzzer"] = indicators.buzzerActive() ? "ACTIVE" : "MUTED";
  hardware["rfidReady"] = true;
  hardware["ultrasonicReady"] = true;

  String body;
  serializeJson(document, body);
  sendCors();
  webServer.send(200, "application/json", body);
}

void applyDesiredState(JsonObjectConst desiredState) {
  const bool locked = desiredState["servoLocked"] | gate.isLocked();
  if (locked) {
    gate.lock();
  } else {
    gate.unlock(kUnlockDurationMs);
  }

  const String ledState = desiredState["indicatorLed"] | "";
  if (ledState.indexOf("GREEN") >= 0 && !locked) {
    indicators.granted();
  } else {
    indicators.restricted();
  }

  const String buzzerState = desiredState["systemBuzzer"] | "";
  if (buzzerState == "ACTIVE") {
    indicators.setBuzzer(true);
  }
}

void handleControllerCommand() {
  if (!controllerSecretMatches()) {
    sendCors();
    webServer.send(401, "application/json", "{\"ok\":false,\"error\":\"Invalid device secret\"}");
    return;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, webServer.arg("plain"));
  if (error) {
    sendCors();
    webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"Invalid JSON\"}");
    return;
  }

  const String commandId = document["commandId"] | "";
  String command = document["command"] | "";
  command.toUpperCase();

  if (command == "SET_STATE") {
    applyDesiredState(document["desiredState"].as<JsonObjectConst>());
  } else if (command == "GRANT") {
    gate.unlock(kUnlockDurationMs);
    indicators.granted();
  } else if (command == "DENY") {
    gate.lock();
    indicators.signalDenied(kDeniedSignalDurationMs);
  } else if (command == "LOCK") {
    gate.lock();
    indicators.restricted();
  } else if (command == "IDLE") {
    indicators.idle();
  } else {
    sendCors();
    webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"Unknown command\"}");
    return;
  }

  sendControllerStatus(commandId);
}

void startControllerServer() {
  if (!serverRoutesRegistered) {
    static const char* kCollectedHeaders[] = { "x-device-secret" };
    webServer.collectHeaders(kCollectedHeaders, 1);
    webServer.on("/api/hardware/status", HTTP_GET, []() { sendControllerStatus(); });
    webServer.on("/api/hardware/command", HTTP_POST, handleControllerCommand);
    webServer.on("/api/hardware/status", HTTP_OPTIONS, []() {
      sendCors();
      webServer.send(204);
    });
    webServer.on("/api/hardware/command", HTTP_OPTIONS, []() {
      sendCors();
      webServer.send(204);
    });
    serverRoutesRegistered = true;
  }
  webServer.begin();
  Serial.print("Controller HTTP API: http://");
  Serial.println(WiFi.localIP());
}

void processRfid() {
  String uid;
  if (!rfid.poll(uid)) {
    return;
  }

  Serial.println("RFID scanned: " + uid);
  const BackendEventResponse response = backend.sendEvent(
    "RFID_SCANNED",
    "Đã quét thẻ RFID " + uid,
    "\"rfidUid\":\"" + uid + "\""
  );

  if (!response.successful()) {
    Serial.println("RFID decision unavailable; gate remains in its current safe state.");
    return;
  }

  if (response.accessDecision == "GRANT") {
    gate.unlock(kUnlockDurationMs);
    indicators.granted();
    Serial.println("RFID access granted locally from backend response.");
  } else if (response.accessDecision == "DENY") {
    // A denied scan must not slam a gate that is already open under a valid
    // access lease. When locked, signal denial immediately.
    if (gate.isLocked()) {
      indicators.signalDenied(kDeniedSignalDurationMs);
    }
    Serial.println("RFID access denied locally from backend response.");
  } else {
    Serial.println("RFID response did not contain a final GRANT/DENY decision.");
  }
}

void processUltrasonic() {
  const unsigned long now = millis();
  if (!gate.isLocked() || now - lastSensorPollAt < kSensorPollIntervalMs) {
    return;
  }
  lastSensorPollAt = now;

  const int distance = ultrasonic.distanceCm();
  if (distance <= 0 || distance > kRecognitionDistanceCm) {
    return;
  }
  if (lastPresenceEventAt != 0
      && now - lastPresenceEventAt < kPresenceEventCooldownMs) {
    return;
  }
  lastPresenceEventAt = now;

  backend.sendEvent(
    "PRESENCE_DETECTED",
    "Phát hiện người/vật thể trong vùng nhận diện khuôn mặt",
    "\"distanceCm\":" + String(distance)
      + ",\"recognitionDistanceCm\":" + String(kRecognitionDistanceCm)
  );
}

void processHeartbeat() {
  const unsigned long now = millis();
  if (now - lastHeartbeatAt < kHeartbeatIntervalMs) {
    return;
  }
  lastHeartbeatAt = now;
  backend.sendEvent(
    "CONTROLLER_HEARTBEAT",
    "Bộ điều khiển hoạt động bình thường",
    controllerHardwareEventJson()
  );
}

void maintainWifi() {
  const unsigned long now = millis();
  if (WiFi.status() == WL_CONNECTED || now - lastWifiAttemptAt < 10000UL) {
    return;
  }
  lastWifiAttemptAt = now;
  if (connectWifi()) {
    startControllerServer();
    backend.sendEvent(
      "CONTROLLER_ONLINE",
      "Bộ điều khiển đã kết nối lại",
      controllerHardwareEventJson()
    );
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  gate.begin();
  indicators.begin();
  rfid.begin(Pins::kRfidClock, Pins::kRfidMiso, Pins::kRfidMosi);
  ultrasonic.begin();
  safetyButton.begin();

  if (connectWifi()) {
    startControllerServer();
    backend.sendEvent(
      "CONTROLLER_ONLINE",
      "Bộ điều khiển cổng đã sẵn sàng",
      controllerHardwareEventJson()
    );
  }
}

void loop() {
  maintainWifi();
  webServer.handleClient();

  processRfid();
  processUltrasonic();
  processHeartbeat();

  if (gate.update()) {
    indicators.restricted();
  }
  indicators.update();

  if (safetyButton.pressed()) {
    if (gate.isLocked()) {
      indicators.restricted();
    } else {
      indicators.granted();
    }
    backend.sendEvent(
      "SAFETY_BUTTON_PRESSED",
      "Đã xóa cảnh báo bằng nút tại chỗ",
      controllerHardwareEventJson()
    );
    Serial.println("Safety alarm cleared by button.");
  }

  delay(10);
}
