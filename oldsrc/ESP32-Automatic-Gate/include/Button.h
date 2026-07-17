#include <Arduino.h>

struct Button {
  int pin;

  Button(int pin);
  void init();
  bool is_pressed();
};