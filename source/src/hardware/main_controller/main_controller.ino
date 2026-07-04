#include <Arduino.h>
#include <ESP32Servo.h>

constexpr uint8_t kGrantedLedPin = 21;
constexpr uint8_t kDeniedLedPin = 19;
constexpr uint8_t kServoPin = 22;

constexpr int kLockAngle = 0;
constexpr int kUnlockAngle = 90;
constexpr unsigned long kUnlockDurationMs = 3000UL;

Servo gateServo;
String serialBuffer;

void setIdleLed() {
  digitalWrite(kGrantedLedPin, LOW);
  digitalWrite(kDeniedLedPin, LOW);
}

void lockGate() {
  gateServo.write(kLockAngle);
  setIdleLed();
  Serial.println("Gate locked.");
}

void unlockGateDemo() {
  digitalWrite(kGrantedLedPin, HIGH);
  digitalWrite(kDeniedLedPin, LOW);
  gateServo.write(kUnlockAngle);
  Serial.println("Gate unlocked for demo.");
  delay(kUnlockDurationMs);
  lockGate();
}

void signalDenied() {
  digitalWrite(kGrantedLedPin, LOW);
  digitalWrite(kDeniedLedPin, HIGH);
  Serial.println("Access denied indicator on.");
  delay(500);
  setIdleLed();
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
}

void loop() {
  pollSerialCommands();
  delay(20);
}
