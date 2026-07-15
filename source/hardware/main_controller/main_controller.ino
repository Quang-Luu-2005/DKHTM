#include <Arduino.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <WebServer.h>

// Set these to the same network used by the Sentinel backend.
constexpr char kWifiSsid[] = "PhĂ­chhh";
constexpr char kWifiPass[] = "canhacungvui";
constexpr int kWifiMaxRetries = 30;
WebServer webServer(80);

constexpr uint8_t kGrantedLedPin = 21;
constexpr uint8_t kDeniedLedPin = 19;
constexpr uint8_t kServoPin = 22;

constexpr int kLockAngle = 0;
constexpr int kUnlockAngle = 90;
constexpr unsigned long kUnlockDurationMs = 3000UL;

Servo gateServo;
String serialBuffer;
bool gateLocked = true;
bool buzzerActive = false;
String ledState = "RED / RESTRICTED";

void setIdleLed() {
  digitalWrite(kGrantedLedPin, LOW);
  digitalWrite(kDeniedLedPin, LOW);
}

void lockGate() {
  gateServo.write(kLockAngle);
  setIdleLed();
  gateLocked = true;
  buzzerActive = false;
  ledState = "RED / RESTRICTED";
  Serial.println("Gate locked.");
}

void unlockGate() {
  digitalWrite(kGrantedLedPin, HIGH);
  digitalWrite(kDeniedLedPin, LOW);
  gateServo.write(kUnlockAngle);
  gateLocked = false;
  buzzerActive = false;
  ledState = "GREEN / ACCESS ALLOWED";
  Serial.println("Gate unlocked.");
}

void unlockGateDemo() {
  unlockGate();
  delay(kUnlockDurationMs);
  lockGate();
}

void signalDenied() {
  digitalWrite(kGrantedLedPin, LOW);
  digitalWrite(kDeniedLedPin, HIGH);
  gateLocked = true;
  buzzerActive = true;
  ledState = "RED / RESTRICTED";
  Serial.println("Access denied indicator on.");
  delay(500);
  setIdleLed();
  buzzerActive = false;
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
  gateLocked = jsonBoolField(body, "servoLocked", gateLocked);
  String requestedBuzzer = jsonStringField(body, "systemBuzzer");
  if (!requestedBuzzer.isEmpty()) buzzerActive = requestedBuzzer == "ACTIVE";
  String requestedLed = jsonStringField(body, "indicatorLed");
  if (!requestedLed.isEmpty()) ledState = requestedLed;

  gateServo.write(gateLocked ? kLockAngle : kUnlockAngle);
  const bool green = ledState.indexOf("GREEN") >= 0;
  digitalWrite(kGrantedLedPin, green ? HIGH : LOW);
  digitalWrite(kDeniedLedPin, green ? LOW : HIGH);
  Serial.println(gateLocked ? "Desired state applied: locked." : "Desired state applied: unlocked.");
}

void sendControllerStatus(const String& commandId = "") {
  sendCors();
  String body = "{\"ok\":true";
  if (!commandId.isEmpty()) body += ",\"commandId\":\"" + commandId + "\"";
  body += ",\"online\":true,\"servoLocked\":";
  body += gateLocked ? "true" : "false";
  body += ",\"servoArm\":\"";
  body += gateLocked ? "SECURED / CLOSED" : "OPENED / UNSECURED";
  body += "\",\"indicatorLed\":\"" + ledState + "\",\"systemBuzzer\":\"";
  body += buzzerActive ? "ACTIVE" : "MUTED";
  body += "\",\"hardware\":{\"servoLocked\":";
  body += gateLocked ? "true" : "false";
  body += ",\"servoArm\":\"";
  body += gateLocked ? "SECURED / CLOSED" : "OPENED / UNSECURED";
  body += "\",\"indicatorLed\":\"" + ledState + "\",\"systemBuzzer\":\"";
  body += buzzerActive ? "ACTIVE" : "MUTED";
  body += "\"}}";
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
  else if (command == "grant") unlockGate();
  else if (command == "deny") signalDenied();
  else if (command == "idle") { setIdleLed(); buzzerActive = false; }
  else if (command == "lock") lockGate();
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
  Serial.println("  grant | 1 | d  -> open servo + granted LED");
  Serial.println("  deny  | 0 | s  -> blink denied LED");
  Serial.println("  lock           -> force lock position");
  Serial.println("  idle           -> turn both LEDs off");
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
    unlockGateDemo();
    return;
  }

  if (command == "deny" || command == "0" || command == "s") {
    signalDenied();
    return;
  }

  if (command == "lock") {
    lockGate();
    return;
  }

  if (command == "idle") {
    setIdleLed();
    Serial.println("Indicators set to idle.");
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

  lockGate();
  printHelp();
  if (connectWifi()) startControllerServer();
  else Serial.println("WiFi unavailable; serial control remains active.");
}

void loop() {
  pollSerialCommands();
  webServer.handleClient();
  delay(20);
}
