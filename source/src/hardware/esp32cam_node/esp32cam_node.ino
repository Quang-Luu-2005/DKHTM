#include <Arduino.h>

#include "core/app_state.h"
#include "services/backend_client.h"
#include "services/camera_service.h"
#include "face/face_engine.h"
#include "web/web_server.h"

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
