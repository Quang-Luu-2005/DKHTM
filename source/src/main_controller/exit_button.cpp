#include "main_controller/exit_button.h"

#include <Arduino.h>

#include "main_controller/gate_control.h"
#include "main_controller/sensors.h"

void handleExitButton() {
  if (!isExitButtonPressed()) {
    return;
  }

  Serial.println("Exit button pressed.");
  unlockGate("Exit button pressed");
  delay(500);
}
