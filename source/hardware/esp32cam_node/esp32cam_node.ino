#include <Arduino.h>

#include "config.h"
#include "types.h"
#include "app_state.h"
#include "json_utils.h"
#include "web_server.h"
#include "camera_service.h"
#include "backend_client.h"
#include "face_engine.h"
#include "web_handlers.h"

void setup() {
  Serial.begin(115200);
  delay(1000);

  bool wifiReady = connectWiFi();
  cameraReady = initCameraHardware();
  setupFaceEngine();

  if (wifiReady) {
    startPreviewServer();
  }

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

  webServer.handleClient();
  processBackendSnapshotTask();

  delay(10);
}
