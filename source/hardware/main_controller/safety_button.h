#pragma once

#include <Arduino.h>

class SafetyButton {
 public:
  explicit SafetyButton(uint8_t pin);

  void begin();
  bool pressed();

 private:
  uint8_t pin_;
  bool previousState_ = false;
  unsigned long lastChangeAt_ = 0;
};

inline SafetyButton::SafetyButton(uint8_t pin) : pin_(pin) {}

inline void SafetyButton::begin() {
  pinMode(pin_, INPUT_PULLDOWN);
}

inline bool SafetyButton::pressed() {
  const bool currentState = digitalRead(pin_) == HIGH;
  const unsigned long now = millis();
  bool risingEdge = false;

  if (currentState != previousState_ && now - lastChangeAt_ >= 40UL) {
    lastChangeAt_ = now;
    risingEdge = currentState && !previousState_;
    previousState_ = currentState;
  }
  return risingEdge;
}
