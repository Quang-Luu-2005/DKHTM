#pragma once

#include <Arduino.h>

class UltrasonicSensor {
 public:
  UltrasonicSensor(uint8_t trigPin, uint8_t echoPin);

  void begin();
  int distanceCm() const;

 private:
  uint8_t trigPin_;
  uint8_t echoPin_;
};
