#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <esp32-hal-psram.h>

#include "app_state.h"
#include "config.h"
#include "camera_service.h"
#include "face_engine.h"
#include "backend_client.h"
#include "json_utils.h"
#include "web_server.h"

static void handleRoot();
static void handleStatus();
static void handleFaceLastResult();
static void handleFaceIds();
static void handleFaceDelete();
static void handleFaceEnroll();
static void handleFaceEmbedding();
static void handleFaceEmbeddingRaw();
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
  webServer.on(
    "/face/embedding",
    HTTP_POST,
    handleFaceEmbedding,
    handleFaceEmbeddingRaw
  );

  webServer.on("/", HTTP_OPTIONS, handleOptions);
  webServer.on("/status", HTTP_OPTIONS, handleOptions);
  webServer.on("/capture", HTTP_OPTIONS, handleOptions);
  webServer.on("/stream", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/last-result", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/enroll", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/ids", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/delete", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/embedding", HTTP_OPTIONS, handleOptions);

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
  body += ",\"embeddingModel\":\"" + String(kFaceEmbeddingModel) + "\"";
  body += ",\"embeddingUploadWidth\":" + String(kEmbeddingUploadWidth);
  body += ",\"embeddingUploadHeight\":" + String(kEmbeddingUploadHeight);
  body += ",\"embeddingUploadMaxBytes\":" + String(kMaxEmbeddingUploadBytes);
  body += ",\"faceBusy\":";
  body += faceBusy ? "true" : "false";
  body += ",\"enrolledCount\":" + String(enrolledFaceCount());
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
    "  /face/enroll?name=...  - deprecated (returns HTTP 410)\n"
    "  /face/ids              - deprecated; local roster is always empty\n"
    "  /face/delete?id=...    - deprecated (returns HTTP 410)\n"
    "  POST /face/embedding   - authenticated raw QVGA JPEG to normalized embedding\n"
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
  sendJsonResponse(
    200,
    "{\"ok\":true,\"deprecated\":true,\"count\":0,\"identities\":[],"
    "\"message\":\"Identity profiles are stored and matched by the backend database.\"}"
  );
}

static void handleFaceDelete() {
  sendJsonResponse(
    410,
    buildSimpleFaceResultJson(
      false,
      "delete",
      "Local identity deletion is disabled. Delete the user's FaceProfile through the backend."
    )
  );
}

static void handleFaceEnroll() {
  sendJsonResponse(
    410,
    buildSimpleFaceResultJson(
      false,
      "enroll",
      "Local face enrollment is disabled. Upload a JPEG through the backend, which calls POST /face/embedding."
    )
  );
}

static uint8_t* faceEmbeddingUploadBuffer = nullptr;
static size_t faceEmbeddingUploadExpectedLength = 0;
static size_t faceEmbeddingUploadLength = 0;
static int faceEmbeddingUploadErrorStatus = 0;
static String faceEmbeddingUploadError;
static bool faceEmbeddingUploadComplete = false;

static void resetFaceEmbeddingUpload() {
  if (faceEmbeddingUploadBuffer != nullptr) {
    free(faceEmbeddingUploadBuffer);
    faceEmbeddingUploadBuffer = nullptr;
  }
  faceEmbeddingUploadExpectedLength = 0;
  faceEmbeddingUploadLength = 0;
  faceEmbeddingUploadErrorStatus = 0;
  faceEmbeddingUploadError = "";
  faceEmbeddingUploadComplete = false;
}

static bool deviceSecretMatches(const String& supplied) {
  const size_t expectedLength = strlen(kDeviceSecret);
  if (supplied.length() != expectedLength) {
    return false;
  }

  uint8_t difference = 0;
  for (size_t index = 0; index < expectedLength; ++index) {
    difference |= static_cast<uint8_t>(supplied[index] ^ kDeviceSecret[index]);
  }
  return difference == 0;
}

static bool isJpegContentType() {
  String contentType = webServer.header("Content-Type");
  contentType.trim();
  contentType.toLowerCase();
  return contentType == "image/jpeg" || contentType.startsWith("image/jpeg;");
}

static void setFaceEmbeddingUploadError(int statusCode, const String& message) {
  faceEmbeddingUploadErrorStatus = statusCode;
  faceEmbeddingUploadError = message;
  faceEmbeddingUploadComplete = false;
  if (faceEmbeddingUploadBuffer != nullptr) {
    free(faceEmbeddingUploadBuffer);
    faceEmbeddingUploadBuffer = nullptr;
  }
  faceEmbeddingUploadLength = 0;
}

static void handleFaceEmbeddingRaw() {
  // The same WebServer callback is also used for multipart upload chunks.
  // This endpoint accepts raw image/jpeg only, so never dereference raw()
  // for another content type.
  if (!isJpegContentType()) {
    return;
  }

  HTTPRaw& raw = webServer.raw();
  if (raw.status == RAW_START) {
    resetFaceEmbeddingUpload();

    if (!deviceSecretMatches(webServer.header("x-device-secret"))) {
      setFaceEmbeddingUploadError(401, "Invalid device secret.");
      return;
    }
    if (!psramFound()) {
      setFaceEmbeddingUploadError(503, "PSRAM is required for JPEG embedding extraction.");
      return;
    }

    const int contentLength = webServer.clientContentLength();
    if (contentLength <= 0) {
      setFaceEmbeddingUploadError(411, "A non-empty Content-Length is required.");
      return;
    }
    if (static_cast<size_t>(contentLength) > kMaxEmbeddingUploadBytes) {
      setFaceEmbeddingUploadError(413, "JPEG exceeds the configured upload limit.");
      return;
    }

    faceEmbeddingUploadExpectedLength = static_cast<size_t>(contentLength);
    faceEmbeddingUploadBuffer =
      static_cast<uint8_t*>(ps_malloc(faceEmbeddingUploadExpectedLength));
    if (faceEmbeddingUploadBuffer == nullptr) {
      setFaceEmbeddingUploadError(503, "Not enough PSRAM for the uploaded JPEG.");
    }
    return;
  }

  if (raw.status == RAW_ABORTED) {
    setFaceEmbeddingUploadError(400, "JPEG upload was aborted.");
    return;
  }

  if (faceEmbeddingUploadErrorStatus != 0 || faceEmbeddingUploadBuffer == nullptr) {
    return;
  }

  if (raw.status == RAW_WRITE) {
    if (raw.currentSize > faceEmbeddingUploadExpectedLength - faceEmbeddingUploadLength) {
      setFaceEmbeddingUploadError(413, "JPEG body is larger than Content-Length.");
      return;
    }
    memcpy(
      faceEmbeddingUploadBuffer + faceEmbeddingUploadLength,
      raw.buf,
      raw.currentSize
    );
    faceEmbeddingUploadLength += raw.currentSize;
    return;
  }

  if (raw.status == RAW_END) {
    if (faceEmbeddingUploadLength != faceEmbeddingUploadExpectedLength) {
      setFaceEmbeddingUploadError(400, "JPEG body length does not match Content-Length.");
      return;
    }
    faceEmbeddingUploadComplete = true;
  }
}

static bool isJpegStartOfFrameMarker(uint8_t marker) {
  switch (marker) {
    case 0xC0:
    case 0xC1:
    case 0xC2:
    case 0xC3:
    case 0xC5:
    case 0xC6:
    case 0xC7:
    case 0xC9:
    case 0xCA:
    case 0xCB:
    case 0xCD:
    case 0xCE:
    case 0xCF:
      return true;
    default:
      return false;
  }
}

static bool readJpegDimensions(
  const uint8_t* jpeg,
  size_t length,
  uint16_t& width,
  uint16_t& height
) {
  width = 0;
  height = 0;
  if (jpeg == nullptr || length < 4 || jpeg[0] != 0xFF || jpeg[1] != 0xD8) {
    return false;
  }

  size_t index = 2;
  while (index + 1 < length) {
    while (index < length && jpeg[index] == 0xFF) {
      ++index;
    }
    if (index >= length) {
      return false;
    }

    const uint8_t marker = jpeg[index++];
    if (marker == 0x00) {
      continue;
    }
    if (marker == 0xD9 || marker == 0xDA) {
      return false;
    }
    if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      continue;
    }
    if (index + 2 > length) {
      return false;
    }

    const size_t segmentLength =
      (static_cast<size_t>(jpeg[index]) << 8U) | jpeg[index + 1];
    if (segmentLength < 2 || segmentLength > length - index) {
      return false;
    }

    if (isJpegStartOfFrameMarker(marker)) {
      if (segmentLength < 7) {
        return false;
      }
      height = static_cast<uint16_t>(
        (static_cast<uint16_t>(jpeg[index + 3]) << 8U) | jpeg[index + 4]
      );
      width = static_cast<uint16_t>(
        (static_cast<uint16_t>(jpeg[index + 5]) << 8U) | jpeg[index + 6]
      );
      return width > 0 && height > 0;
    }

    index += segmentLength;
  }
  return false;
}

static void sendFaceEmbeddingUploadError(int statusCode, const String& message) {
  const String body = buildSimpleFaceResultJson(false, "embedding-upload", message);
  resetFaceEmbeddingUpload();
  sendJsonResponse(statusCode, body);
}

static void handleFaceEmbedding() {
  if (!deviceSecretMatches(webServer.header("x-device-secret"))) {
    sendFaceEmbeddingUploadError(401, "Invalid device secret.");
    return;
  }
  if (!isJpegContentType()) {
    sendFaceEmbeddingUploadError(415, "Content-Type must be image/jpeg.");
    return;
  }
  if (faceEmbeddingUploadErrorStatus != 0) {
    const int statusCode = faceEmbeddingUploadErrorStatus;
    const String message = faceEmbeddingUploadError;
    sendFaceEmbeddingUploadError(statusCode, message);
    return;
  }
  if (!faceEmbeddingUploadComplete
      || faceEmbeddingUploadBuffer == nullptr
      || faceEmbeddingUploadLength == 0) {
    sendFaceEmbeddingUploadError(400, "A complete raw JPEG body is required.");
    return;
  }
  if (!faceDetectionAvailable || !faceRecognitionAvailable) {
    sendFaceEmbeddingUploadError(503, faceEngineMessage);
    return;
  }

  uint16_t width = 0;
  uint16_t height = 0;
  if (!readJpegDimensions(
        faceEmbeddingUploadBuffer,
        faceEmbeddingUploadLength,
        width,
        height
      )) {
    sendFaceEmbeddingUploadError(400, "Invalid JPEG header or missing SOF dimensions.");
    return;
  }
  if (width != kEmbeddingUploadWidth || height != kEmbeddingUploadHeight) {
    sendFaceEmbeddingUploadError(
      422,
      "JPEG must be exactly "
        + String(kEmbeddingUploadWidth)
        + "x"
        + String(kEmbeddingUploadHeight)
        + " pixels (QVGA)."
    );
    return;
  }
  if (!acquireFaceLock()) {
    sendFaceEmbeddingUploadError(409, "ESP32-CAM is busy processing another face.");
    return;
  }

  camera_fb_t uploadedFrame;
  memset(&uploadedFrame, 0, sizeof(uploadedFrame));
  uploadedFrame.buf = faceEmbeddingUploadBuffer;
  uploadedFrame.len = faceEmbeddingUploadLength;
  uploadedFrame.width = width;
  uploadedFrame.height = height;
  uploadedFrame.format = PIXFORMAT_JPEG;

  FaceProcessingOptions options;
  options.detect = true;
  options.extractEmbedding = true;
  options.requireSingleFaceForEmbedding = true;
  options.encodeJpeg = false;
  options.returnFrameToCamera = false;
  options.action = "embedding-upload";

  FaceProcessingOutcome outcome;
  const bool processed = processFrameForFace(&uploadedFrame, options, outcome);
  updateLastFaceResult(
    processed
      ? buildFaceResultJson(options.action, outcome)
      : buildSimpleFaceResultJson(false, options.action, outcome.error)
  );

  String responseBody;
  int responseStatus = 500;
  if (!processed) {
    responseBody = buildSimpleFaceResultJson(false, options.action, outcome.error);
  } else {
    responseBody = buildEmbeddingResultJson(options.action, outcome, true);
    responseStatus = outcome.ok && outcome.embeddingExtracted ? 200 : 422;
  }

  releaseFaceLock();
  resetFaceEmbeddingUpload();
  sendJsonResponse(responseStatus, responseBody);
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
  options.extractEmbedding = recognize;
  options.requireSingleFaceForEmbedding = recognize;
  options.drawBoxes = true;
  options.action = recognize ? "embedding-probe" : "detect";

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
  if (recognize) {
    publishFaceEmbeddingOutcome(outcome);
  }
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

    const bool requestedDetectionDue =
      detect && (((frameIndex - 1) % static_cast<unsigned long>(detectEvery)) == 0UL);
    const bool automaticRecognition = automaticRecognitionDue();
    const bool shouldDetectThisFrame = requestedDetectionDue || automaticRecognition;

    if (shouldDetectThisFrame) {
      bool faceLockAcquired = false;
      if (automaticRecognition) {
        faceLockAcquired = acquireFaceLock();
      }

      FaceProcessingOptions options;
      options.detect = true;
      options.extractEmbedding = faceLockAcquired;
      options.requireSingleFaceForEmbedding = faceLockAcquired;
      options.drawBoxes = true;
      options.action = faceLockAcquired ? "stream-embedding" : "stream-detect";

      FaceProcessingOutcome outcome;
      if (!processFrameForFace(frame, options, outcome, static_cast<uint8_t>(streamJpegQuality))) {
        updateLastFaceResult(buildSimpleFaceResultJson(false, options.action, outcome.error));
        if (faceLockAcquired) {
          releaseFaceLock();
        }
        break;
      }

      updateLastFaceResult(buildFaceResultJson(options.action, outcome));
      if (faceLockAcquired) {
        publishFaceEmbeddingOutcome(outcome);
        releaseFaceLock();
      }
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

    processCameraHeartbeatTask();
    delay(streamDelayMs);
  }
}

static void handleNotFound() {
  sendCorsHeaders();
  webServer.send(404, "text/plain", "Not found");
}
