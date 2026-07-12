#pragma once

#include <Arduino.h>
#include <WiFi.h>

#include "app_state.h"
#include "config.h"
#include "camera_service.h"
#include "face_engine.h"
#include "json_utils.h"
#include "web_server.h"

static void handleRoot();
static void handleStatus();
static void handleFaceLastResult();
static void handleFaceIds();
static void handleFaceDelete();
static void handleFaceEnroll();
static void handleCapture();
static void handleStream();
static void handleNotFound();

static void registerPreviewRoutes() {
  webServer.on("/", HTTP_GET, handleRoot);
  webServer.on("/status", HTTP_GET, handleStatus);
  webServer.on("/capture", HTTP_GET, handleCapture);
  webServer.on("/stream", HTTP_GET, handleStream);
  webServer.on("/face/last-result", HTTP_GET, handleFaceLastResult);
  webServer.on("/face/enroll", HTTP_GET, handleFaceEnroll);
  webServer.on("/face/ids", HTTP_GET, handleFaceIds);
  webServer.on("/face/delete", HTTP_GET, handleFaceDelete);

  webServer.on("/", HTTP_OPTIONS, handleOptions);
  webServer.on("/status", HTTP_OPTIONS, handleOptions);
  webServer.on("/capture", HTTP_OPTIONS, handleOptions);
  webServer.on("/stream", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/last-result", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/enroll", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/ids", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/delete", HTTP_OPTIONS, handleOptions);

  webServer.onNotFound(handleNotFound);
}

static String buildStatusJson() {
  sensor_t* sensor = esp_camera_sensor_get();
  String body = "{";
  body += "\"deviceId\":\"" + String(kEsp32CamDeviceId) + "\"";
  body += ",\"doorId\":\"" + String(kDoorId) + "\"";
  body += ",\"wifiConnected\":";
  body += WiFi.status() == WL_CONNECTED ? "true" : "false";
  body += ",\"cameraReady\":";
  body += cameraReady ? "true" : "false";
  body += ",\"backendUploadEnabled\":";
  body += kEnableBackendUpload ? "true" : "false";
  body += ",\"faceDetectionAvailable\":";
  body += faceDetectionAvailable ? "true" : "false";
  body += ",\"faceRecognitionAvailable\":";
  body += faceRecognitionAvailable ? "true" : "false";
  body += ",\"faceRecognitionMode\":\"" + faceRecognitionMode() + "\"";
  body += ",\"faceBusy\":";
  body += faceBusy ? "true" : "false";
  body += ",\"enrolledCount\":" + String(faceRecognitionAvailable ? recognizer.get_enrolled_id_num() : 0);
  body += ",\"streamFrameDelayMs\":" + String(kStreamFrameDelayMs);
  body += ",\"streamDetectJpegQuality\":" + String(kStreamDetectJpegQuality);
  body += ",\"streamFastMode\":true";
  body += ",\"streamDetectEverySupported\":true";
  body += ",\"streamQualitySupported\":true";
  body += ",\"streamDelaySupported\":true";
  body += ",\"psramFound\":";
  body += psramFound() ? "true" : "false";
  body += ",\"ip\":\"" + WiFi.localIP().toString() + "\"";
  body += ",\"faceEngineMessage\":\"" + escapeJson(faceEngineMessage) + "\"";

  if (sensor != nullptr) {
    body += ",\"frameSize\":" + String(sensor->status.framesize);
    body += ",\"quality\":" + String(sensor->status.quality);
    body += ",\"pixformat\":" + String(sensor->pixformat);
  } else {
    body += ",\"frameSize\":-1";
    body += ",\"quality\":-1";
    body += ",\"pixformat\":-1";
  }

  body += "}";
  return body;
}

static void handleRoot() {
  sendCorsHeaders();
  webServer.send(
    200,
    "text/plain",
    "ESP32-CAM preview server\n"
    "Endpoints:\n"
    "  /status                - JSON status\n"
    "  /capture               - JPEG snapshot\n"
    "  /capture?detect=1      - snapshot with face boxes\n"
    "  /capture?detect=1&recognize=1 - snapshot with face recognition\n"
    "  /stream                - fast MJPEG live stream\n"
    "  /stream?detect=1       - MJPEG stream with face boxes every frame\n"
    "  /stream?detect=1&detectEvery=5 - balanced stream, detect every 5 frames\n"
    "  /face/last-result      - latest face metadata JSON\n"
    "  /face/enroll?name=...  - enroll one face from current frame\n"
    "  /face/ids              - list enrolled identities\n"
    "  /face/delete?id=...    - delete an enrolled identity\n"
  );
}

static void handleStatus() {
  sendJsonResponse(200, buildStatusJson());
}

static void handleFaceLastResult() {
  if (lastFaceResultJson.length() == 0) {
    updateLastFaceResult(buildSimpleFaceResultJson(false, "idle", "Chưa có kết quả xử lý khuôn mặt nào."));
  }

  sendJsonResponse(200, lastFaceResultJson);
}

static void handleFaceIds() {
  if (!faceRecognitionAvailable) {
    sendJsonResponse(503, buildSimpleFaceResultJson(false, "list-ids", faceEngineMessage));
    return;
  }

  std::vector<face_info_t> ids = recognizer.get_enrolled_ids();
  String body = "{";
  body += "\"ok\":true";
  body += ",\"count\":" + String(ids.size());
  body += ",\"identities\":[";

  for (size_t index = 0; index < ids.size(); ++index) {
    if (index > 0) {
      body += ",";
    }

    body += "{";
    body += "\"id\":" + String(ids[index].id);
    body += ",\"name\":\"" + escapeJson(String(ids[index].name.c_str())) + "\"";
    body += "}";
  }

  body += "]}";
  sendJsonResponse(200, body);
}

static void handleFaceDelete() {
  if (!faceRecognitionAvailable) {
    sendJsonResponse(503, buildSimpleFaceResultJson(false, "delete", faceEngineMessage));
    return;
  }

  if (!webServer.hasArg("id")) {
    sendJsonResponse(400, buildSimpleFaceResultJson(false, "delete", "Thiếu tham số id."));
    return;
  }

  const int id = webServer.arg("id").toInt();
  const int remaining = recognizer.delete_id(id, true);
  if (remaining < 0) {
    sendJsonResponse(404, buildSimpleFaceResultJson(false, "delete", "Không tìm thấy ID cần xóa."));
    return;
  }

  String body = "{";
  body += "\"ok\":true";
  body += ",\"message\":\"Đã xóa danh tính khỏi bộ nhớ.\"";
  body += ",\"remaining\":" + String(remaining);
  body += "}";
  sendJsonResponse(200, body);
}

static void handleFaceEnroll() {
  if (!faceRecognitionAvailable) {
    sendJsonResponse(503, buildSimpleFaceResultJson(false, "enroll", faceEngineMessage));
    return;
  }

  String name = normalizeIdentityName(webServer.arg("name"));
  if (name.length() == 0) {
    sendJsonResponse(400, buildSimpleFaceResultJson(false, "enroll", "Tên người đăng ký không được để trống."));
    return;
  }

  if (!acquireFaceLock()) {
    sendJsonResponse(409, buildSimpleFaceResultJson(false, "enroll", "ESP32-CAM đang bận xử lý khuôn mặt khác."));
    return;
  }

  camera_fb_t* frame = captureCameraFrame();
  FaceProcessingOptions options;
  options.detect = true;
  options.enroll = true;
  options.drawBoxes = true;
  options.enrollName = name;
  options.action = "enroll";

  FaceProcessingOutcome outcome;
  bool processed = processFrameForFace(frame, options, outcome);
  if (processed) {
    const String body = buildFaceResultJson(options.action, outcome);
    updateLastFaceResult(body);
    sendJsonResponse(outcome.ok ? 200 : 422, body);
    if (outcome.jpegBuffer != nullptr) {
      free(outcome.jpegBuffer);
    }
  } else {
    const String errorBody = buildSimpleFaceResultJson(false, options.action, outcome.error);
    updateLastFaceResult(errorBody);
    sendJsonResponse(500, errorBody);
  }

  releaseFaceLock();
}

static void handleCapture() {
  if (!cameraReady) {
    sendCorsHeaders();
    webServer.send(503, "text/plain", "Camera is not ready");
    return;
  }

  const bool detect = queryFlag("detect", false);
  const bool recognize = queryFlag("recognize", false);
  const bool shouldProcessFace = detect || recognize;

  if (!shouldProcessFace) {
    camera_fb_t* frame = captureCameraFrame();
    if (frame == nullptr) {
      sendCorsHeaders();
      webServer.send(500, "text/plain", "Camera capture failed");
      return;
    }

    sendJpegResponse(frame->buf, frame->len);
    esp_camera_fb_return(frame);
    return;
  }

  if (!faceDetectionAvailable) {
    sendCorsHeaders();
    webServer.send(503, "text/plain", faceEngineMessage);
    return;
  }

  bool locked = false;
  if (recognize) {
    locked = acquireFaceLock();
    if (!locked) {
      sendCorsHeaders();
      webServer.send(409, "text/plain", "ESP32-CAM đang bận xử lý khuôn mặt khác.");
      return;
    }
  }

  camera_fb_t* frame = captureCameraFrame();
  FaceProcessingOptions options;
  options.detect = true;
  options.recognize = recognize;
  options.drawBoxes = true;
  options.action = recognize ? "recognize" : "detect";

  FaceProcessingOutcome outcome;
  bool processed = processFrameForFace(frame, options, outcome);
  if (!processed) {
    const String errorBody = buildSimpleFaceResultJson(false, options.action, outcome.error);
    updateLastFaceResult(errorBody);
    sendCorsHeaders();
    webServer.send(500, "text/plain", outcome.error);
    if (locked) {
      releaseFaceLock();
    }
    return;
  }

  updateLastFaceResult(buildFaceResultJson(options.action, outcome));
  sendJpegResponse(outcome.jpegBuffer, outcome.jpegLength);
  if (outcome.jpegBuffer != nullptr) {
    free(outcome.jpegBuffer);
  }

  if (locked) {
    releaseFaceLock();
  }
}

static void handleStream() {
  if (!cameraReady) {
    sendCorsHeaders();
    webServer.send(503, "text/plain", "Camera is not ready");
    return;
  }

  const bool detect = queryFlag("detect", false);
  const int detectEvery = queryInt("detectEvery", 1, 1, 30);
  const int streamDelayMs = queryInt("delay", kStreamFrameDelayMs, 0, 250);
  const int streamJpegQuality = queryInt("quality", kStreamDetectJpegQuality, 45, 95);
  if (detect && !faceDetectionAvailable) {
    sendCorsHeaders();
    webServer.send(503, "text/plain", faceEngineMessage);
    return;
  }

  WiFiClient client = webServer.client();

  client.println("HTTP/1.1 200 OK");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Cache-Control: no-store");
  client.println("Connection: close");
  client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
  client.println();

  unsigned long frameIndex = 0;

  while (client.connected()) {
    frameIndex++;
    camera_fb_t* frame = captureCameraFrame();
    if (frame == nullptr) {
      break;
    }

    const uint8_t* jpegBuffer = nullptr;
    size_t jpegLength = 0;
    bool freeBuffer = false;

    const bool shouldDetectThisFrame = detect && (((frameIndex - 1) % static_cast<unsigned long>(detectEvery)) == 0UL);

    if (shouldDetectThisFrame) {
      FaceProcessingOptions options;
      options.detect = true;
      options.drawBoxes = true;
      options.action = "stream-detect";

      FaceProcessingOutcome outcome;
      if (!processFrameForFace(frame, options, outcome, static_cast<uint8_t>(streamJpegQuality))) {
        updateLastFaceResult(buildSimpleFaceResultJson(false, options.action, outcome.error));
        break;
      }

      updateLastFaceResult(buildFaceResultJson(options.action, outcome));
      jpegBuffer = outcome.jpegBuffer;
      jpegLength = outcome.jpegLength;
      freeBuffer = true;
    } else {
      jpegBuffer = frame->buf;
      jpegLength = frame->len;
    }

    client.println("--frame");
    client.println("Content-Type: image/jpeg");
    client.print("Content-Length: ");
    client.println(jpegLength);
    client.println();
    client.write(jpegBuffer, jpegLength);
    client.println();

    if (freeBuffer) {
      free(const_cast<uint8_t*>(jpegBuffer));
    } else {
      esp_camera_fb_return(frame);
    }

    delay(streamDelayMs);
  }
}

static void handleNotFound() {
  sendCorsHeaders();
  webServer.send(404, "text/plain", "Not found");
}
