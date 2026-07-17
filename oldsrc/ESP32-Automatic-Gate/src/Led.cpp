#include <Arduino.h>
#include "Led.h"
#include "SystemConfig.h"

Led::Led(int red, int green): red_pin(red), green_pin(green) {}

void Led::init() {
  pinMode(red_pin, OUTPUT);
  pinMode(green_pin, OUTPUT);
}

void Led::light_red() {
  if (!g_config.led) return;
  digitalWrite(red_pin, HIGH);
} 

void Led::light_green() {
  if (!g_config.led) return;
  digitalWrite(green_pin, HIGH);
} 

void Led::no_light() {
  digitalWrite(red_pin, LOW);
  digitalWrite(green_pin, LOW);
}
