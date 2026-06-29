#include "camera_node/camera_events.h"

#include <ArduinoJson.h>

#include "camera_node/camera_service.h"
#include "common/backend_client.h"
#include "config/project_config.h"

void sendCameraEvent(const String& eventType, const String& message) {
  StaticJsonDocument<384> doc;
  doc["deviceId"] = kEsp32CamDeviceId;
  doc["doorId"] = kDoorId;
  doc["source"] = "ESP32_CAM";
  doc["eventType"] = eventType;
  doc["message"] = message;
  doc["confidence"] = 0.90;

  String body;
  serializeJson(doc, body);

  int statusCode = postJsonToBackend("/api/device/events", body);

  Serial.print("Send camera event ");
  Serial.print(eventType);
  Serial.print(" status: ");
  Serial.println(statusCode);
}

bool uploadSnapshot() {
  camera_fb_t* frame = captureCameraFrame();

  if (frame == nullptr) {
    return false;
  }

  String path = String("/api/device/camera/snapshot")
              + "?deviceId=" + kEsp32CamDeviceId
              + "&doorId=" + kDoorId;

  int statusCode = postJpegToBackend(path, frame->buf, frame->len);
  releaseCameraFrame(frame);

  Serial.print("Upload snapshot status: ");
  Serial.println(statusCode);

  if (statusCode >= 200 && statusCode < 300) {
    sendCameraEvent("SNAPSHOT_UPLOADED", "Camera snapshot uploaded");
    return true;
  }

  sendCameraEvent("SNAPSHOT_UPLOAD_FAILED", "Camera snapshot upload failed");
  return false;
}
