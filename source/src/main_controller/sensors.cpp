#include "main_controller/sensors.h"

#include <Arduino.h>

#include "pins/main_controller_pins.h"

namespace {
bool isIrActive(uint8_t pin) {
  int value = digitalRead(pin);
  return kIrActiveLow ? value == LOW : value == HIGH;
}
}  // namespace

void initSensors() {
  pinMode(kPersonIrPin, INPUT);
  pinMode(kGateTopIrPin, INPUT);
  pinMode(kExitButtonPin, INPUT_PULLUP);
  pinMode(kDoorSensorPin, INPUT_PULLUP);
}

bool isPersonNearGate() {
  return isIrActive(kPersonIrPin);
}

bool isGateTopBlocked() {
  return isIrActive(kGateTopIrPin);
}

bool isExitButtonPressed() {
  return digitalRead(kExitButtonPin) == LOW;
}

bool isDoorOpen() {
  return digitalRead(kDoorSensorPin) == LOW;
}
