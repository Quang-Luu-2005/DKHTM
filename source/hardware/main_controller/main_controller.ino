#include <Arduino.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <WebServer.h>

#include "gate_state_machine.h"

// Set these to the same network used by the Sentinel backend.
constexpr char kWifiSsid[] = "PhĂ­chhh";
constexpr char kWifiPass[] = "canhacungvui";
constexpr int kWifiMaxRetries = 30;
WebServer webServer(80);

// Keep these aligned with src/GPIO_Mapping.md on the Van branch.
// GPIO19 is reserved for RFID MISO and GPIO21 is reserved for the buzzer.
constexpr uint8_t kGrantedLedPin = 32;
constexpr uint8_t kDeniedLedPin = 33;
constexpr uint8_t kServoPin = 26;

static_assert(kGrantedLedPin != kDeniedLedPin, "LED pins must be unique");
static_assert(kGrantedLedPin != kServoPin, "Servo and LED pins must be unique");
static_assert(kDeniedLedPin != kServoPin, "Servo and LED pins must be unique");

constexpr int kLockAngle = 0;
constexpr int kUnlockAngle = 90;
constexpr unsigned long kServoTravelDurationMs = 500UL;
constexpr unsigned long kGateHoldDurationMs = 3000UL;
constexpr unsigned long kDeniedIndicatorDurationMs = 500UL;

Servo gateServo;
GateStateMachine gateStateMachine(kServoTravelDurationMs, kGateHoldDurationMs);
String serialBuffer;
bool buzzerActive = false;
String ledState = "RED / RESTRICTED";
bool deniedIndicatorActive = false;
unsigned long deniedIndicatorStartedAtMs = 0;

void setIdleLed() {
  digitalWrite(kGrantedLedPin, LOW);
  digitalWrite(kDeniedLedPin, LOW);
}

bool isGateOpenState(GateState state) {
  return state == GateState::OPENING || state == GateState::HOLDING;
}

void applyGateIndicators() {
  if (deniedIndicatorActive) {
    digitalWrite(kGrantedLedPin, LOW);
    digitalWrite(kDeniedLedPin, HIGH);
    buzzerActive = true;
    ledState = "RED / RESTRICTED";
    return;
  }

  if (isGateOpenState(gateStateMachine.state())) {
    digitalWrite(kGrantedLedPin, HIGH);
    digitalWrite(kDeniedLedPin, LOW);
    buzzerActive = false;
    ledState = "GREEN / ACCESS ALLOWED";
    return;
  }

  setIdleLed();
  buzzerActive = false;
  ledState = "RED / RESTRICTED";
}

void applyGateTransition(GateState previous, GateState current) {
  if (previous == current) {
    return;
  }

  if (current == GateState::OPENING) {
    gateServo.write(kUnlockAngle);
  } else if (current == GateState::CLOSING ||
             current == GateState::CLOSED) {
    gateServo.write(kLockAngle);
  }

  applyGateIndicators();
  Serial.print("Gate state: ");
  Serial.print(GateStateMachine::name(previous));
  Serial.print(" -> ");
  Serial.println(GateStateMachine::name(current));
}

void requestGateOpen() {
  const unsigned long now = millis();
  const GateState previous = gateStateMachine.state();
  deniedIndicatorActive = false;
  const bool changed = gateStateMachine.requestOpen(now);

  if (changed) {
    applyGateTransition(previous, gateStateMachine.state());
  } else if (previous == GateState::HOLDING) {
    applyGateIndicators();
    Serial.println("Gate hold extended.");
  }
}

void requestGateClose() {
  const GateState previous = gateStateMachine.state();
  if (gateStateMachine.requestClose(millis())) {
    applyGateTransition(previous, gateStateMachine.state());
  } else {
    // Keep status and indicators consistent for an idempotent lock command.
    applyGateIndicators();
  }
}

void updateGateControl() {
  const GateState previous = gateStateMachine.state();
  if (gateStateMachine.update(millis())) {
    applyGateTransition(previous, gateStateMachine.state());
  }
}

void signalDenied() {
  requestGateClose();
  deniedIndicatorActive = true;
  deniedIndicatorStartedAtMs = millis();
  applyGateIndicators();
  Serial.println("Access denied indicator on.");
}

void updateDeniedIndicator() {
  if (!deniedIndicatorActive) {
    return;
  }

  if (millis() - deniedIndicatorStartedAtMs >=
      kDeniedIndicatorDurationMs) {
    deniedIndicatorActive = false;
    applyGateIndicators();
  }
}

void sendCors() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  webServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

String jsonStringField(const String& json, const String& key) {
  const String marker = "\"" + key + "\"";
  int keyIndex = json.indexOf(marker);
  if (keyIndex < 0) return "";
  int colonIndex = json.indexOf(':', keyIndex + marker.length());
  int startQuote = json.indexOf('"', colonIndex + 1);
  int endQuote = json.indexOf('"', startQuote + 1);
  if (colonIndex < 0 || startQuote < 0 || endQuote < 0) return "";
  return json.substring(startQuote + 1, endQuote);
}

bool jsonBoolField(const String& json, const String& key, bool fallback) {
  const String marker = "\"" + key + "\"";
  int keyIndex = json.indexOf(marker);
  if (keyIndex < 0) return fallback;
  int colonIndex = json.indexOf(':', keyIndex + marker.length());
  if (colonIndex < 0) return fallback;
  String value = json.substring(colonIndex + 1, colonIndex + 8);
  value.trim();
  if (value.startsWith("true")) return true;
  if (value.startsWith("false")) return false;
  return fallback;
}

void applyDesiredState(const String& body) {
  const bool requestedLocked =
      jsonBoolField(body, "servoLocked", gateStateMachine.isLocked());
  if (requestedLocked) {
    requestGateClose();
  } else {
    requestGateOpen();
  }

  String requestedBuzzer = jsonStringField(body, "systemBuzzer");
  if (!requestedBuzzer.isEmpty()) buzzerActive = requestedBuzzer == "ACTIVE";
  String requestedLed = jsonStringField(body, "indicatorLed");
  if (!requestedLed.isEmpty()) ledState = requestedLed;

  const bool green = ledState.indexOf("GREEN") >= 0;
  digitalWrite(kGrantedLedPin, green ? HIGH : LOW);
  digitalWrite(kDeniedLedPin, green ? LOW : HIGH);
  Serial.println(requestedLocked ? "Desired state applied: closing."
                                 : "Desired state applied: opening.");
}

void sendControllerStatus(const String& commandId = "") {
  const unsigned long now = millis();
  const bool gateLocked = gateStateMachine.isLocked();
  const char* gateState = GateStateMachine::name(gateStateMachine.state());
  const unsigned long remainingHoldMs =
      gateStateMachine.remainingHoldMs(now);

  sendCors();
  String body = "{\"ok\":true";
  if (!commandId.isEmpty()) body += ",\"commandId\":\"" + commandId + "\"";
  body += ",\"online\":true,\"servoLocked\":";
  body += gateLocked ? "true" : "false";
  body += ",\"servoArm\":\"";
  body += gateLocked ? "SECURED / CLOSED" : "OPENED / UNSECURED";
  body += "\",\"indicatorLed\":\"" + ledState + "\",\"systemBuzzer\":\"";
  body += buzzerActive ? "ACTIVE" : "MUTED";
  body += "\",\"gateState\":\"";
  body += gateState;
  body += "\",\"remainingHoldMs\":";
  body += String(remainingHoldMs);
  body += ",\"holdDurationMs\":";
  body += String(kGateHoldDurationMs);
  body += ",\"hardware\":{\"servoLocked\":";
  body += gateLocked ? "true" : "false";
  body += ",\"servoArm\":\"";
  body += gateLocked ? "SECURED / CLOSED" : "OPENED / UNSECURED";
  body += "\",\"indicatorLed\":\"" + ledState + "\",\"systemBuzzer\":\"";
  body += buzzerActive ? "ACTIVE" : "MUTED";
  body += "\",\"gateState\":\"";
  body += gateState;
  body += "\",\"remainingHoldMs\":";
  body += String(remainingHoldMs);
  body += ",\"holdDurationMs\":";
  body += String(kGateHoldDurationMs);
  body += "}}";
  webServer.send(200, "application/json", body);
}

void handleControllerStatus() {
  sendControllerStatus();
}

void handleControllerCommand() {
  String body = webServer.arg("plain");
  const String commandId = jsonStringField(body, "commandId");
  String command = jsonStringField(body, "command");
  command.toLowerCase();
  sendCors();
  if (command == "set_state") applyDesiredState(body);
  else if (command == "grant") requestGateOpen();
  else if (command == "deny") signalDenied();
  else if (command == "idle") {
    deniedIndicatorActive = false;
    setIdleLed();
    buzzerActive = false;
    ledState = "IDLE";
  } else if (command == "lock") requestGateClose();
  else { webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"Unknown command\"}"); return; }
  sendControllerStatus(commandId);
}

void startControllerServer() {
  webServer.on("/api/hardware/status", HTTP_GET, handleControllerStatus);
  webServer.on("/api/hardware/command", HTTP_POST, handleControllerCommand);
  webServer.on("/api/hardware/status", HTTP_OPTIONS, []() { sendCors(); webServer.send(204); });
  webServer.on("/api/hardware/command", HTTP_OPTIONS, []() { sendCors(); webServer.send(204); });
  webServer.begin();
  Serial.print("Controller HTTP API: http://");
  Serial.println(WiFi.localIP());
}

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(kWifiSsid, kWifiPass);
  for (int retry = 0; retry < kWifiMaxRetries && WiFi.status() != WL_CONNECTED; retry++) delay(500);
  return WiFi.status() == WL_CONNECTED;
}

void printHelp() {
  Serial.println();
  Serial.println("=== ESP32 main controller demo ===");
  Serial.println("Commands via Serial Monitor:");
  Serial.println("  grant | 1 | d  -> open, hold, then auto-close");
  Serial.println("  deny  | 0 | s  -> blink denied LED");
  Serial.println("  lock           -> force lock position");
  Serial.println("  idle           -> turn both LEDs off");
  Serial.println("  status         -> print current gate state");
  Serial.println("  help           -> show this message");
  Serial.println();
}

void handleCommand(String command) {
  command.trim();
  command.toLowerCase();

  if (command.isEmpty()) {
    return;
  }

  if (command == "grant" || command == "1" || command == "d") {
    requestGateOpen();
    return;
  }

  if (command == "deny" || command == "0" || command == "s") {
    signalDenied();
    return;
  }

  if (command == "lock") {
    requestGateClose();
    return;
  }

  if (command == "idle") {
    deniedIndicatorActive = false;
    setIdleLed();
    buzzerActive = false;
    ledState = "IDLE";
    Serial.println("Indicators set to idle.");
    return;
  }

  if (command == "status") {
    Serial.print("Gate state: ");
    Serial.print(GateStateMachine::name(gateStateMachine.state()));
    Serial.print(", remaining hold: ");
    Serial.print(gateStateMachine.remainingHoldMs(millis()));
    Serial.println(" ms");
    return;
  }

  if (command == "help") {
    printHelp();
    return;
  }

  Serial.print("Unknown command: ");
  Serial.println(command);
  printHelp();
}

void pollSerialCommands() {
  while (Serial.available() > 0) {
    char ch = static_cast<char>(Serial.read());

    if (ch == '\r') {
      continue;
    }

    if (ch == '\n') {
      handleCommand(serialBuffer);
      serialBuffer = "";
      continue;
    }

    serialBuffer += ch;

    if (serialBuffer.length() > 64) {
      serialBuffer.remove(0, serialBuffer.length() - 64);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(kGrantedLedPin, OUTPUT);
  pinMode(kDeniedLedPin, OUTPUT);

  ESP32PWM::allocateTimer(0);
  gateServo.setPeriodHertz(50);
  gateServo.attach(kServoPin, 500, 2400);

  gateStateMachine.begin(millis());
  gateServo.write(kLockAngle);
  applyGateIndicators();
  Serial.println("Gate state initialized: CLOSED.");
  printHelp();
  if (connectWifi()) startControllerServer();
  else Serial.println("WiFi unavailable; serial control remains active.");
}

void loop() {
  updateGateControl();
  updateDeniedIndicator();
  pollSerialCommands();
  webServer.handleClient();
  delay(20);
}
