#include "Buzzer.h"
#include "SystemConfig.h"
#define BUZZER_CH  6
#define BUZZER_RES 8


Buzzer::Buzzer(int pin): pin(pin), is_siren_active(false), last_siren_toggle(0), siren_high(false) {}

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
  start_siren();
}

void Buzzer::start_siren() {
  if (!g_config.buzzer) return;
  ledcAttachPin(pin, BUZZER_CH);
  is_siren_active = true;
  siren_high = true;
  last_siren_toggle = millis();
  ledcWriteTone(BUZZER_CH, 2400);
}

void Buzzer::update_siren() {
  if (!is_siren_active || !g_config.buzzer) return;
  const unsigned long now = millis();
  if (now - last_siren_toggle >= 180) {
    last_siren_toggle = now;
    siren_high = !siren_high;
    ledcWriteTone(BUZZER_CH, siren_high ? 2600 : 1800);
  }
}

void Buzzer::no_sound() {
  is_siren_active = false;
  ledcAttachPin(pin, BUZZER_CH);
  ledcWriteTone(BUZZER_CH, 0);
}

