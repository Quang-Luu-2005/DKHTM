#include "main_controller/indicators.h"

#include <Arduino.h>

#include "pins/main_controller_pins.h"

namespace {
void beep(int times, int durationMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(kBuzzerPin, HIGH);
    delay(durationMs);
    digitalWrite(kBuzzerPin, LOW);
    delay(durationMs);
  }
}
}  // namespace

void initIndicators() {
  pinMode(kBuzzerPin, OUTPUT);
  pinMode(kLedGreenPin, OUTPUT);
  pinMode(kLedRedPin, OUTPUT);

  digitalWrite(kBuzzerPin, LOW);
  setIdleLed();
}

void setIdleLed() {
  digitalWrite(kLedGreenPin, LOW);
  digitalWrite(kLedRedPin, LOW);
}

void signalGranted() {
  digitalWrite(kLedGreenPin, HIGH);
  digitalWrite(kLedRedPin, LOW);
  beep(1, 120);
}

void signalDenied() {
  digitalWrite(kLedGreenPin, LOW);
  digitalWrite(kLedRedPin, HIGH);
  beep(3, 120);
  delay(500);
  setIdleLed();
}

void signalAlert() {
  digitalWrite(kLedGreenPin, LOW);
  digitalWrite(kLedRedPin, HIGH);
  beep(5, 100);
  setIdleLed();
}
