#include <Arduino.h>

#include "camera_node/camera_events.h"
#include "camera_node/camera_service.h"
#include "common/wifi_manager.h"
#include "config/project_config.h"

unsigned long lastSnapshotTime = 0;
bool cameraReady = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectWiFi();

  cameraReady = initCameraHardware();

  if (cameraReady) {
    sendCameraEvent("CAMERA_ONLINE", "ESP32-CAM is online");
  } else {
    sendCameraEvent("CAMERA_ERROR", "ESP32-CAM init failed");
  }
}

void loop() {
  if (!isWiFiConnected()) {
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastSnapshotTime >= kSnapshotIntervalMs) {
    lastSnapshotTime = now;

    if (!cameraReady) {
      Serial.println("Camera is not ready. Skip snapshot.");
      sendCameraEvent("CAMERA_ERROR", "Camera is not ready");
    } else {
      sendCameraEvent("PERSON_CHECK", "Camera checking gate area");
      uploadSnapshot();
    }
  }

  delay(200);
}
