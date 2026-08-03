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

inline GateActuator::GateActuator(uint8_t pin, int lockedAngle, int unlockedAngle)
    : pin_(pin), lockedAngle_(lockedAngle), unlockedAngle_(unlockedAngle) {}

inline void GateActuator::begin() {
  ESP32PWM::allocateTimer(0);
  servo_.setPeriodHertz(50);
  servo_.attach(pin_, 500, 2400);
  lock();
}

inline void GateActuator::lock() {
  servo_.write(lockedAngle_);
  locked_ = true;
  autoLockAt_ = 0;
  Serial.println("Gate locked.");
}

inline void GateActuator::unlock(unsigned long durationMs) {
  servo_.write(unlockedAngle_);
  locked_ = false;
  autoLockAt_ = durationMs > 0 ? millis() + durationMs : 0;
  Serial.println("Gate unlocked.");
}

inline bool GateActuator::update() {
  if (locked_ || autoLockAt_ == 0) {
    return false;
  }

  if (static_cast<long>(millis() - autoLockAt_) < 0) {
    return false;
  }

  lock();
  return true;
}

inline bool GateActuator::isLocked() const {
  return locked_;
}

inline const char* GateActuator::armState() const {
  return locked_ ? "SECURED / CLOSED" : "OPENED / UNSECURED";
}
