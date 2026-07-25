#pragma once

#include <Arduino.h>
#include <ESP32Servo.h>

class GateActuator {
 public:
  GateActuator(uint8_t pin, int lockedAngle, int unlockedAngle);

  void begin();
  void lock();
  void unlock(unsigned long durationMs);
  bool update();
  bool isLocked() const;
  const char* armState() const;

 private:
  uint8_t pin_;
  int lockedAngle_;
  int unlockedAngle_;
  bool locked_ = true;
  unsigned long autoLockAt_ = 0;
  Servo servo_;
};
