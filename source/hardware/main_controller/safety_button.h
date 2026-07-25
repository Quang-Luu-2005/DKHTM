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
