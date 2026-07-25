#include "safety_button.h"

SafetyButton::SafetyButton(uint8_t pin) : pin_(pin) {}

void SafetyButton::begin() {
  pinMode(pin_, INPUT_PULLDOWN);
}

bool SafetyButton::pressed() {
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
