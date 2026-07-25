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

WebServer webServer(80);
GateActuator gate(kServoPin, kLockedAngle, kUnlockedAngle);
StatusIndicators indicators(kRedLedPin, kGreenLedPin, kBuzzerPin);
RfidReader rfid(kRfidSsPin, kRfidRstPin);
UltrasonicSensor ultrasonic(kUltrasonicTrigPin, kUltrasonicEchoPin);
SafetyButton safetyButton(kButtonPin);
ControllerBackendClient backend(kBackendBaseUrl, kDeviceSecret, kDeviceId, kGateId);

unsigned long lastSensorPollAt = 0;
unsigned long lastViolationAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastWifiAttemptAt = 0;
bool serverRoutesRegistered = false;

void sendCors() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  webServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
    indicators.signalDenied(kDeniedSignalDurationMs);
  }
}

void handleControllerCommand() {
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
  backend.sendEvent(
    "RFID_SCANNED",
    "Đã quét thẻ RFID " + uid,
    "\"rfidUid\":\"" + uid + "\""
  );
}

void processUltrasonic() {
  const unsigned long now = millis();
  if (!gate.isLocked() || now - lastSensorPollAt < kSensorPollIntervalMs) {
    return;
  }
  lastSensorPollAt = now;

  const int distance = ultrasonic.distanceCm();
  if (distance <= 0 || distance > kViolationDistanceCm) {
    return;
  }
  if (lastViolationAt != 0 && now - lastViolationAt < kViolationCooldownMs) {
    return;
  }
  lastViolationAt = now;

  indicators.signalDenied(kDeniedSignalDurationMs);
  backend.sendEvent(
    "INTRUSION_DETECTED",
    "Phát hiện vật cản khi cửa đang khóa",
    "\"distanceCm\":" + String(distance)
  );
}

void processHeartbeat() {
  const unsigned long now = millis();
  if (now - lastHeartbeatAt < kHeartbeatIntervalMs) {
    return;
  }
  lastHeartbeatAt = now;
  backend.sendEvent("CONTROLLER_HEARTBEAT", "Bộ điều khiển hoạt động bình thường");
}

void maintainWifi() {
  const unsigned long now = millis();
  if (WiFi.status() == WL_CONNECTED || now - lastWifiAttemptAt < 10000UL) {
    return;
  }
  lastWifiAttemptAt = now;
  if (connectWifi()) {
    startControllerServer();
    backend.sendEvent("CONTROLLER_ONLINE", "Bộ điều khiển đã kết nối lại");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  gate.begin();
  indicators.begin();
  rfid.begin(kRfidSckPin, kRfidMisoPin, kRfidMosiPin);
  ultrasonic.begin();
  safetyButton.begin();

  if (connectWifi()) {
    startControllerServer();
    backend.sendEvent("CONTROLLER_ONLINE", "Bộ điều khiển cổng đã sẵn sàng");
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
    indicators.restricted();
    Serial.println("Safety alarm cleared by button.");
  }

  delay(10);
}
