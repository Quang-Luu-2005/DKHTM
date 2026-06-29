#include <Arduino.h>

#include "common/wifi_manager.h"
#include "main_controller/device_events.h"
#include "main_controller/exit_button.h"
#include "main_controller/gate_control.h"
#include "main_controller/heartbeat.h"
#include "main_controller/indicators.h"
#include "main_controller/intrusion_monitor.h"
#include "main_controller/rfid_access.h"
#include "main_controller/sensors.h"

void setup() {
  Serial.begin(115200);
  delay(1000);

  initIndicators();
  initSensors();
  initGateControl();
  initRfidReader();

  connectWiFi();
  sendDeviceEvent("DEVICE_ONLINE", "ESP32 main controller started");

  Serial.println("System ready.");
}

void loop() {
  if (!isWiFiConnected()) {
    connectWiFi();
  }

  handleRfid();
  handleIntrusion();
  handleExitButton();
  sendHeartbeat();

  delay(100);
}
