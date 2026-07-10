#include "backend_client.h"

#include <HTTPClient.h>
#include <WiFi.h>

#include "../core/app_state.h"
#include "camera_service.h"
#include "../core/config.h"

bool isWiFiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

bool connectWiFi() {
  if (isWiFiConnected()) {
    return true;
  }

  Serial.print("Connecting WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(kWifiSsid, kWifiPass);

  int retry = 0;
  while (!isWiFiConnected() && retry < kWifiMaxRetries) {
    delay(kWifiRetryDelayMs);
    Serial.print('.');
    retry++;
  }

  Serial.println();

  if (isWiFiConnected()) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("WiFi connection failed.");
  return false;
}

int postJsonToBackend(const String& path, const String& body) {
  if (!kEnableBackendUpload) {
    Serial.println("Backend upload disabled. Skip JSON request.");
    return 0;
  }

  if (!connectWiFi()) {
    Serial.println("WiFi not connected. Skip JSON request.");
    return -1;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(kServerBaseUrl) + path;

  http.begin(client, url);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", kDeviceSecret);

  int statusCode = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.print("JSON response: ");
  Serial.println(response);
  return statusCode;
}

int postJpegToBackend(const String& pathAndQuery, uint8_t* payload, size_t payloadLength) {
  if (!kEnableBackendUpload) {
    Serial.println("Backend upload disabled. Skip JPEG request.");
    return 0;
  }

  if (!connectWiFi()) {
    Serial.println("WiFi not connected. Skip JPEG request.");
    return -1;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(kServerBaseUrl) + pathAndQuery;

  http.begin(client, url);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-device-secret", kDeviceSecret);

  int statusCode = http.POST(payload, payloadLength);
  http.end();
  return statusCode;
}

void sendCameraEvent(const String& eventType, const String& message) {
  String body = "{";
  body += "\"deviceId\":\"" + String(kEsp32CamDeviceId) + "\",";
  body += "\"doorId\":\"" + String(kDoorId) + "\",";
  body += "\"source\":\"ESP32_CAM\",";
  body += "\"eventType\":\"" + eventType + "\",";
  body += "\"message\":\"" + message + "\",";
  body += "\"confidence\":0.90";
  body += "}";

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
              + "?deviceId=" + String(kEsp32CamDeviceId)
              + "&doorId=" + String(kDoorId);

  int statusCode = postJpegToBackend(path, frame->buf, frame->len);
  esp_camera_fb_return(frame);

  Serial.print("Upload snapshot status: ");
  Serial.println(statusCode);

  if (statusCode >= 200 && statusCode < 300) {
    sendCameraEvent("SNAPSHOT_UPLOADED", "Camera snapshot uploaded");
    return true;
  }

  sendCameraEvent("SNAPSHOT_UPLOAD_FAILED", "Camera snapshot upload failed");
  return false;
}

void processBackendSnapshotTask() {
  if (!kEnableBackendUpload) {
    return;
  }

  unsigned long now = millis();
  if (now - lastSnapshotTime < kSnapshotIntervalMs) {
    return;
  }

  lastSnapshotTime = now;

  if (!cameraReady) {
    Serial.println("Camera is not ready. Skip snapshot.");
    sendCameraEvent("CAMERA_ERROR", "Camera is not ready");
    return;
  }

  sendCameraEvent("PERSON_CHECK", "Camera checking gate area");
  uploadSnapshot();
}
