#include "main_controller/intrusion_monitor.h"

#include <Arduino.h>

#include "config/project_config.h"
#include "main_controller/device_events.h"
#include "main_controller/gate_control.h"
#include "main_controller/indicators.h"
#include "main_controller/sensors.h"

namespace {
unsigned long lastIntrusionAlertTime = 0;
}  // namespace

void handleIntrusion() {
  if (!isGateTopBlocked() || isGateUnlocked()) {
    return;
  }

  unsigned long now = millis();

  if (now - lastIntrusionAlertTime < kIntrusionCooldownMs) {
    return;
  }

  lastIntrusionAlertTime = now;

  Serial.println("Intrusion detected!");
  signalAlert();
  sendDeviceEvent("INTRUSION_DETECTED", "Detected climbing or jumping over the gate");
}
