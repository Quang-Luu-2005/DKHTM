#pragma once

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "app_state.h"
#include "camera_service.h"
#include "config.h"
#include "face_engine.h"
#include "json_utils.h"

static unsigned long cameraEventSequence = 0;
static uint32_t cameraBootId = 0;
static unsigned long lastRecognitionAttemptTime = 0;
static unsigned long lastRecognitionEventTime = 0;
static unsigned long lastHeartbeatTime = 0;
static String lastRecognitionEventKey;

static bool isWiFiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

static bool connectWiFi() {
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

static int postJsonToBackend(const String& path, const String& body) {
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
  const String url = String(kServerBaseUrl) + path;

  http.begin(client, url);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", kDeviceSecret);

  const int statusCode = http.POST(body);
  const String response = http.getString();
  http.end();

  Serial.print("Backend response: ");
  Serial.println(response);
  return statusCode;
}

static int postJpegToBackend(const String& pathAndQuery, const uint8_t* payload, size_t payloadLength) {
  if (!kEnableBackendUpload || payload == nullptr || payloadLength == 0) {
    return 0;
  }

  if (!connectWiFi()) {
    return -1;
  }

  WiFiClient client;
  HTTPClient http;
  const String url = String(kServerBaseUrl) + pathAndQuery;

  http.begin(client, url);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-device-secret", kDeviceSecret);

  const int statusCode = http.POST(const_cast<uint8_t*>(payload), payloadLength);
  http.end();
  return statusCode;
}

static String nextCameraEventId() {
  cameraEventSequence++;
  if (cameraBootId == 0) {
    cameraBootId = esp_random();
  }
  return String("camera-") + String(cameraBootId, HEX) + "-" + String(cameraEventSequence);
}

static int sendEventWithId(
  const String& eventId,
  const String& eventType,
  const String& message,
  float confidence,
  const String& extraJson = ""
) {
  String body = "{";
  body += "\"eventId\":\"" + escapeJson(eventId) + "\",";
  body += "\"deviceId\":\"" + String(kEsp32CamDeviceId) + "\",";
  body += "\"gateId\":\"" + String(kDoorId) + "\",";
  body += "\"source\":\"ESP32_CAM\",";
  body += "\"eventType\":\"" + escapeJson(eventType) + "\",";
  body += "\"message\":\"" + escapeJson(message) + "\",";
  body += "\"confidence\":" + String(confidence, 4);
  if (extraJson.length() > 0) {
    body += "," + extraJson;
  }
  body += "}";

  const int statusCode = postJsonToBackend("/api/device/events", body);
  Serial.printf("Camera event %s status: %d\n", eventType.c_str(), statusCode);
  return statusCode;
}

static String sendCameraEvent(const String& eventType, const String& message) {
  const String eventId = nextCameraEventId();
  sendEventWithId(eventId, eventType, message, 1.0F);
  return eventId;
}

static int uploadRecognitionSnapshot(
  const String& eventId,
  const uint8_t* payload,
  size_t payloadLength
) {
  if (!kUploadRecognitionSnapshot) {
    return 0;
  }

  const String path = String("/api/device/camera/snapshot")
                    + "?deviceId=" + String(kEsp32CamDeviceId)
                    + "&gateId=" + String(kDoorId)
                    + "&eventId=" + eventId;
  const int statusCode = postJpegToBackend(path, payload, payloadLength);
  Serial.printf("Recognition snapshot status: %d\n", statusCode);
  return statusCode;
}

static bool automaticRecognitionDue() {
  if (!kAutomaticRecognitionEnabled || !cameraReady || !faceRecognitionAvailable || faceBusy) {
    return false;
  }

  const unsigned long now = millis();
  if (now - lastRecognitionAttemptTime < kRecognitionIntervalMs) {
    return false;
  }
  lastRecognitionAttemptTime = now;
  return true;
}

static bool publishRecognitionOutcome(const FaceProcessingOutcome& outcome) {
  if (!outcome.detected) {
    return false;
  }

  const String eventKey = outcome.recognized
    ? String("GRANT:") + outcome.matchedName
    : String("DENY:UNKNOWN");
  const unsigned long now = millis();
  if (eventKey == lastRecognitionEventKey
      && now - lastRecognitionEventTime < kRecognitionEventCooldownMs) {
    return false;
  }

  lastRecognitionEventKey = eventKey;
  lastRecognitionEventTime = now;

  const String eventId = nextCameraEventId();
  const String eventType = outcome.recognized ? "FACE_RECOGNIZED" : "FACE_DENIED";
  const String subjectName = outcome.recognized ? outcome.matchedName : "Khuôn mặt không xác định";
  const String message = outcome.recognized
    ? "Nhận diện thành công: " + subjectName
    : "Từ chối truy cập: khuôn mặt chưa đăng ký";

  String extra = "\"recognized\":";
  extra += outcome.recognized ? "true" : "false";
  extra += ",\"recognizedId\":" + String(outcome.recognizedId);
  extra += ",\"recognizedName\":\"" + escapeJson(subjectName) + "\"";
  extra += ",\"faceCount\":" + String(outcome.faceCount);
  extra += ",\"accessDecision\":\"";
  extra += outcome.recognized ? "GRANT" : "DENY";
  extra += "\"";

  const int statusCode = sendEventWithId(
    eventId,
    eventType,
    message,
    outcome.recognized ? outcome.similarity : 0.0F,
    extra
  );
  uploadRecognitionSnapshot(eventId, outcome.jpegBuffer, outcome.jpegLength);
  return statusCode >= 200 && statusCode < 300;
}

static void processAutomaticRecognitionTask() {
  if (!automaticRecognitionDue() || !acquireFaceLock()) {
    return;
  }

  camera_fb_t* frame = captureCameraFrame();
  FaceProcessingOptions options;
  options.detect = true;
  options.recognize = true;
  options.drawBoxes = true;
  options.action = "automatic-recognition";

  FaceProcessingOutcome outcome;
  const bool processed = processFrameForFace(frame, options, outcome);
  if (processed) {
    updateLastFaceResult(buildFaceResultJson(options.action, outcome));
    publishRecognitionOutcome(outcome);
  } else {
    updateLastFaceResult(buildSimpleFaceResultJson(false, options.action, outcome.error));
  }

  if (outcome.jpegBuffer != nullptr) {
    free(outcome.jpegBuffer);
  }
  releaseFaceLock();
}

static void processCameraHeartbeatTask() {
  if (!kEnableBackendUpload) {
    return;
  }

  const unsigned long now = millis();
  if (now - lastHeartbeatTime < kHeartbeatIntervalMs) {
    return;
  }
  lastHeartbeatTime = now;
  sendCameraEvent("CAMERA_HEARTBEAT", cameraReady ? "Camera hoạt động bình thường" : "Camera chưa sẵn sàng");
}
