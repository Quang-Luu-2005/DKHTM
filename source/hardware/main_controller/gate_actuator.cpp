#include "gate_actuator.h"

GateActuator::GateActuator(uint8_t pin, int lockedAngle, int unlockedAngle)
    : pin_(pin), lockedAngle_(lockedAngle), unlockedAngle_(unlockedAngle) {}

void GateActuator::begin() {
  ESP32PWM::allocateTimer(0);
  servo_.setPeriodHertz(50);
  servo_.attach(pin_, 500, 2400);
  lock();
}

void GateActuator::lock() {
  servo_.write(lockedAngle_);
  locked_ = true;
  autoLockAt_ = 0;
  Serial.println("Gate locked.");
}

void GateActuator::unlock(unsigned long durationMs) {
  servo_.write(unlockedAngle_);
  locked_ = false;
  autoLockAt_ = durationMs > 0 ? millis() + durationMs : 0;
  Serial.println("Gate unlocked.");
}

bool GateActuator::update() {
  if (locked_ || autoLockAt_ == 0) {
    return false;
  }

  if (static_cast<long>(millis() - autoLockAt_) < 0) {
    return false;
  }

  lock();
  return true;
}

bool GateActuator::isLocked() const {
  return locked_;
}

const char* GateActuator::armState() const {
  return locked_ ? "SECURED / CLOSED" : "OPENED / UNSECURED";
}
