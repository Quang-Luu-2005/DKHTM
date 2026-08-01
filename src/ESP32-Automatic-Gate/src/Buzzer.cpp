#include "Buzzer.h"
#include "SystemConfig.h"
#define BUZZER_CH  6
#define BUZZER_RES 8


Buzzer::Buzzer(int pin):pin(pin) {}

void Buzzer::init() {
  pinMode(pin, OUTPUT);
}

void Buzzer::high_pitch(int duration) {
  if (!g_config.buzzer) return;
  ledcAttachPin(pin, BUZZER_CH);
  ledcWriteTone(BUZZER_CH, 2000);
  delay(duration);
  ledcWriteTone(BUZZER_CH, 0);
}

void Buzzer::low_pitch(int duration) {
  if (!g_config.buzzer) return;
  ledcAttachPin(pin, BUZZER_CH);
  ledcWriteTone(BUZZER_CH, 2500);
  delay(duration);
  ledcWriteTone(BUZZER_CH, 0);
}

void Buzzer::reject_three_beeps() {
  if (!g_config.buzzer) return;
  ledcAttachPin(pin, BUZZER_CH);
  for (int beep = 0; beep < 3; beep++) {
    ledcWriteTone(BUZZER_CH, 2000);
    delay(120);
    ledcWriteTone(BUZZER_CH, 0);
    if (beep < 2) delay(100);
  }
}

void Buzzer::alarm_on() {
  if (!g_config.buzzer) return;
  ledcAttachPin(pin, BUZZER_CH);
  ledcWriteTone(BUZZER_CH, 2000);
}


void Buzzer::no_sound() {
  ledcAttachPin(pin, BUZZER_CH);
  ledcWriteTone(BUZZER_CH, 0);
}
