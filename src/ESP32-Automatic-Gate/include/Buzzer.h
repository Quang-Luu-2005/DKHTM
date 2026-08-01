#include <Arduino.h>


struct Buzzer {
  int pin;

  Buzzer(int pin);
  void init();
  void high_pitch(int duration);
  void low_pitch(int duration);
  void reject_three_beeps();
  void alarm_on();
  void no_sound();

};
