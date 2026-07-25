#pragma once

#include <Arduino.h>

class StatusIndicators {
 public:
  StatusIndicators(uint8_t redPin, uint8_t greenPin, uint8_t buzzerPin);

  void begin();
  void restricted();
  void granted();
  void idle();
  void signalDenied(unsigned long durationMs);
  void setBuzzer(bool active);
  void update();

  bool buzzerActive() const;
  const char* ledState() const;

 private:
  void setLeds(bool red, bool green);

  uint8_t redPin_;
  uint8_t greenPin_;
  uint8_t buzzerPin_;
  bool buzzerActive_ = false;
  const char* ledState_ = "RED / RESTRICTED";
  unsigned long deniedUntil_ = 0;
  static constexpr uint8_t kBuzzerChannel = 6;
};
