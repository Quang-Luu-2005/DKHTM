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

void handleControllerStatus() {
  sendCors();
  String body = "{\"online\":true,\"servoLocked\":";
  body += gateLocked ? "true" : "false";
  body += ",\"servoArm\":\"";
  body += gateLocked ? "SECURED / CLOSED" : "OPENED / UNSECURED";
  body += "\",\"indicatorLed\":\"" + ledState + "\",\"systemBuzzer\":\"";
  body += buzzerActive ? "ACTIVE" : "MUTED";
  body += "\"}";
  webServer.send(200, "application/json", body);
}

void handleControllerCommand() {
  String body = webServer.arg("plain");
  body.toLowerCase();
  sendCors();
  if (body.indexOf("grant") >= 0) unlockGate();
  else if (body.indexOf("deny") >= 0) signalDenied();
  else if (body.indexOf("idle") >= 0) { setIdleLed(); buzzerActive = false; }
  else if (body.indexOf("lock") >= 0) lockGate();
  else { webServer.send(400, "application/json", "{\"error\":\"Unknown command\"}"); return; }
  handleControllerStatus();
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
