#include "main_controller/gate_control.h"

#include <ESP32Servo.h>

#include "main_controller/device_events.h"
#include "main_controller/indicators.h"
#include "pins/main_controller_pins.h"

namespace {
Servo gateServo;
bool gateUnlocked = false;
}  // namespace

void initGateControl() {
  ESP32PWM::allocateTimer(0);
  gateServo.setPeriodHertz(50);
  gateServo.attach(kServoPin, 500, 2400);
  gateServo.write(kLockAngle);
  gateUnlocked = false;
}

bool isGateUnlocked() {
  return gateUnlocked;
}

void lockGate() {
  gateServo.write(kLockAngle);
  gateUnlocked = false;

  Serial.println("Gate locked.");
  sendDeviceEvent("GATE_LOCKED", "Gate locked");
  setIdleLed();
}

void unlockGate(const String& reason, const String& cardUid, const String& personName) {
  Serial.println("Unlocking gate...");

  gateUnlocked = true;
  gateServo.write(kUnlockAngle);

  signalGranted();
  sendDeviceEvent("ACCESS_GRANTED", reason, cardUid, personName);

  delay(kUnlockDurationMs);
  lockGate();
}
