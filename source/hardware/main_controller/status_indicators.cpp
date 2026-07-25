#include "status_indicators.h"

StatusIndicators::StatusIndicators(uint8_t redPin, uint8_t greenPin, uint8_t buzzerPin)
    : redPin_(redPin), greenPin_(greenPin), buzzerPin_(buzzerPin) {}

void StatusIndicators::begin() {
  pinMode(redPin_, OUTPUT);
  pinMode(greenPin_, OUTPUT);
  pinMode(buzzerPin_, OUTPUT);
  ledcAttachPin(buzzerPin_, kBuzzerChannel);
  restricted();
}

void StatusIndicators::setLeds(bool red, bool green) {
  digitalWrite(redPin_, red ? HIGH : LOW);
  digitalWrite(greenPin_, green ? HIGH : LOW);
}

void StatusIndicators::restricted() {
  deniedUntil_ = 0;
  setLeds(true, false);
  setBuzzer(false);
  ledState_ = "RED / RESTRICTED";
}

void StatusIndicators::granted() {
  deniedUntil_ = 0;
  setLeds(false, true);
  setBuzzer(false);
  ledState_ = "GREEN / ACCESS ALLOWED";
}

void StatusIndicators::idle() {
  deniedUntil_ = 0;
  setLeds(false, false);
  setBuzzer(false);
  ledState_ = "RED / RESTRICTED";
}

void StatusIndicators::signalDenied(unsigned long durationMs) {
  setLeds(true, false);
  setBuzzer(true);
  ledState_ = "RED / RESTRICTED";
  deniedUntil_ = millis() + durationMs;
}

void StatusIndicators::setBuzzer(bool active) {
  buzzerActive_ = active;
  ledcWriteTone(kBuzzerChannel, active ? 2000 : 0);
}

void StatusIndicators::update() {
  if (deniedUntil_ == 0 || static_cast<long>(millis() - deniedUntil_) < 0) {
    return;
  }
  deniedUntil_ = 0;
  setBuzzer(false);
}

bool StatusIndicators::buzzerActive() const {
  return buzzerActive_;
}

const char* StatusIndicators::ledState() const {
  return ledState_;
}
