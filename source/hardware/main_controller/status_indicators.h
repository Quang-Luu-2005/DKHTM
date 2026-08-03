#pragma once

#include <Arduino.h>

#if __has_include(<esp_arduino_version.h>)
#include <esp_arduino_version.h>
#endif

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

inline StatusIndicators::StatusIndicators(
  uint8_t redPin,
  uint8_t greenPin,
  uint8_t buzzerPin
) : redPin_(redPin), greenPin_(greenPin), buzzerPin_(buzzerPin) {}

inline void StatusIndicators::begin() {
  pinMode(redPin_, OUTPUT);
  pinMode(greenPin_, OUTPUT);
  pinMode(buzzerPin_, OUTPUT);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(buzzerPin_, 2000, 8);
#else
  ledcSetup(kBuzzerChannel, 2000, 8);
  ledcAttachPin(buzzerPin_, kBuzzerChannel);
#endif
  restricted();
}

inline void StatusIndicators::setLeds(bool red, bool green) {
  digitalWrite(redPin_, red ? HIGH : LOW);
  digitalWrite(greenPin_, green ? HIGH : LOW);
}

inline void StatusIndicators::restricted() {
  deniedUntil_ = 0;
  setLeds(true, false);
  setBuzzer(false);
  ledState_ = "RED / RESTRICTED";
}

inline void StatusIndicators::granted() {
  deniedUntil_ = 0;
  setLeds(false, true);
  setBuzzer(false);
  ledState_ = "GREEN / ACCESS ALLOWED";
}

inline void StatusIndicators::idle() {
  deniedUntil_ = 0;
  setLeds(false, false);
  setBuzzer(false);
  ledState_ = "RED / RESTRICTED";
}

inline void StatusIndicators::signalDenied(unsigned long durationMs) {
  setLeds(true, false);
  setBuzzer(true);
  ledState_ = "RED / RESTRICTED";
  deniedUntil_ = millis() + durationMs;
}

inline void StatusIndicators::setBuzzer(bool active) {
  buzzerActive_ = active;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWriteTone(buzzerPin_, active ? 2000 : 0);
#else
  ledcWriteTone(kBuzzerChannel, active ? 2000 : 0);
#endif
}

inline void StatusIndicators::update() {
  if (deniedUntil_ == 0 || static_cast<long>(millis() - deniedUntil_) < 0) {
    return;
  }
  deniedUntil_ = 0;
  setBuzzer(false);
}

inline bool StatusIndicators::buzzerActive() const {
  return buzzerActive_;
}

inline const char* StatusIndicators::ledState() const {
  return ledState_;
}
