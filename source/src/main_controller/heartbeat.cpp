#include "main_controller/heartbeat.h"

#include <Arduino.h>

#include "config/project_config.h"
#include "main_controller/device_events.h"

namespace {
unsigned long lastHeartbeatTime = 0;
}  // namespace

void sendHeartbeat() {
  unsigned long now = millis();

  if (now - lastHeartbeatTime < kHeartbeatIntervalMs) {
    return;
  }

  lastHeartbeatTime = now;
  sendDeviceEvent("DEVICE_HEARTBEAT", "ESP32 main controller is online");
}
