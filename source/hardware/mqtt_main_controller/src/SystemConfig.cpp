#include "SystemConfig.h"

void SystemConfig::normal_run() {
  system_state = state_normal;
  rfid = 1;
  ultrasonic = 1;
  buzzer = 1;
  servo = 1;
  camera = 1;
  led = 1;
  violation = 0;
}
void SystemConfig::always_open_run() {
  system_state = state_always_open;
  rfid = 0;
  ultrasonic = 0;
  buzzer = 0;
  servo = 1;
  camera = 0;
  led = 1;
}

void SystemConfig::always_close_run() {
  system_state = state_always_close;
  rfid = 0;
  ultrasonic = 1;
  buzzer = 1;
  servo = 1;
  camera = 1;
  led = 1;
}

bool SystemConfig::is_state_change(SystemConfig new_state) {
  if (system_state != new_state.system_state) return true;
  if (rfid != new_state.rfid) return true;
  if (ultrasonic != new_state.ultrasonic) return true;
  if (buzzer != new_state.buzzer) return true;
  if (servo != new_state.servo) return true;
  if (camera != new_state.camera) return true;
  if (led != new_state.led) return true;

  return false;
}