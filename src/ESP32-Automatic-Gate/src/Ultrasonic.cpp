#include "Ultrasonic.h"
#include "SystemConfig.h"
#include <Arduino.h>

namespace {
constexpr int PRESENCE_DISTANCE_CM = 10;
}

Ultrasonic::Ultrasonic(int trig, int echo) : trig_pin(trig), echo_pin(echo) {}

void Ultrasonic::init() {
  pinMode(trig_pin, OUTPUT);
  pinMode(echo_pin, INPUT);
}

int Ultrasonic::get_distance() {
  if (!g_config.ultrasonic)
    return 100;
  digitalWrite(trig_pin, LOW);
  delayMicroseconds(2);
  digitalWrite(trig_pin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig_pin, LOW);

  long duration = pulseIn(echo_pin, HIGH, 30000);

  int distance = duration * 0.034 / 2;
  return distance;
}

bool Ultrasonic::is_present() {
  if (!g_config.ultrasonic)
    return false;
  int distance = get_distance();
  if (distance != 0 && distance <= PRESENCE_DISTANCE_CM) {
    return true;
  }
  return false;
}
