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


void Buzzer::no_sound() {
  if (!g_config.buzzer) return;
  ledcAttachPin(pin, BUZZER_CH);
  ledcWriteTone(BUZZER_CH, 0);
}

