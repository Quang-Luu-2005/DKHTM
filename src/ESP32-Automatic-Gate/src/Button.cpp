#include "Button.h"

Button::Button(int pin): pin(pin){}

void Button::init() {
  pinMode(pin, INPUT);
}

bool Button::is_pressed() {
  int button = digitalRead(pin);
  if (button == HIGH) {
    while (digitalRead(pin) == HIGH);
    return true;
  }
  return false;
}