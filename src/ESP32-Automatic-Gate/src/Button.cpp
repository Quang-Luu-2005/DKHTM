#include "Button.h"

Button::Button(int pin): pin(pin){}

void Button::init() {
  pinMode(pin, INPUT_PULLDOWN);
}

bool Button::is_pressed() {
  if (digitalRead(pin) == HIGH) {
    delay(20); // Debounce
    if (digitalRead(pin) == HIGH) {
      while (digitalRead(pin) == HIGH) {
        delay(10);
      }
      return true;
    }
  }
  return false;
}