#include <Arduino.h>


struct Buzzer {
  int pin;
  bool is_siren_active;
  unsigned long last_siren_toggle;
  bool siren_high;

  Buzzer(int pin);
  void init();
  void high_pitch(int duration);
  void low_pitch(int duration);
  void reject_three_beeps();
  void alarm_on();
  void start_siren();
  void update_siren();
  void no_sound();
};

