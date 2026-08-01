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

inline UltrasonicSensor::UltrasonicSensor(uint8_t trigPin, uint8_t echoPin)
    : trigPin_(trigPin), echoPin_(echoPin) {}

inline void UltrasonicSensor::begin() {
  pinMode(trigPin_, OUTPUT);
  pinMode(echoPin_, INPUT);
  digitalWrite(trigPin_, LOW);
}

inline int UltrasonicSensor::distanceCm() const {
  digitalWrite(trigPin_, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin_, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin_, LOW);

  const unsigned long duration = pulseIn(echoPin_, HIGH, 25000UL);
  if (duration == 0) {
    return -1;
  }
  return static_cast<int>(duration * 0.034F / 2.0F);
}
