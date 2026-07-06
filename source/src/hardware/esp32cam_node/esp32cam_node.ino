#include <Arduino.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <WiFi.h>

#include <list>
#include <string>
#include <vector>

#include "esp_camera.h"
#include "esp_partition.h"
#include "fb_gfx.h"
#include "face_recognition_112_v1_s8.hpp"
#include "human_face_detect_mnp01.hpp"
#include "human_face_detect_msr01.hpp"
#include "img_converters.h"

// Update these values before uploading.
constexpr char kWifiSsid[] = "QuangLuu";
constexpr char kWifiPass[] = "04112005";
constexpr char kServerBaseUrl[] = "http://192.168.1.10:3000";
constexpr char kDeviceSecret[] = "demo-secret";
constexpr char kEsp32CamDeviceId[] = "ESP32CAM_001";
constexpr char kDoorId[] = "GATE_01";

// Keep false when you only want local preview via the web files in repo root.
constexpr bool kEnableBackendUpload = false;

constexpr unsigned long kWifiRetryDelayMs = 500UL;
constexpr int kWifiMaxRetries = 30;
constexpr unsigned long kHttpTimeoutMs = 5000UL;
constexpr unsigned long kSnapshotIntervalMs = 10000UL;
constexpr unsigned long kStreamFrameDelayMs = 10UL;
constexpr bool kUseFlashLed = false;
constexpr uint8_t kFlashLedPin = 4;
constexpr unsigned long kFlashWarmupMs = 150UL;

constexpr uint8_t kFaceJpegQuality = 90;
constexpr uint8_t kStreamDetectJpegQuality = 72;
constexpr size_t kMaxFaceBoxesInJson = 5;
constexpr size_t kMaxEnrollNameLength = 24;
constexpr float kFaceRecognitionThreshold = 0.55F;
constexpr float kFaceDetectScoreThreshold = 0.10F;
constexpr float kFaceDetectNmsThreshold = 0.50F;
constexpr int kFaceDetectTopK = 10;
constexpr float kFaceDetectResizeScale = 0.20F;
constexpr float kFaceKeypointScoreThreshold = 0.50F;
constexpr float kFaceKeypointNmsThreshold = 0.30F;
constexpr int kFaceKeypointTopK = 5;

// AI Thinker ESP32-CAM pin map.
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

WebServer webServer(80);
FaceRecognition112V1S8 recognizer;
HumanFaceDetectMSR01* faceDetectorStageOne = nullptr;
HumanFaceDetectMNP01* faceDetectorStageTwo = nullptr;

unsigned long lastSnapshotTime = 0;
bool cameraReady = false;
bool faceDetectionAvailable = false;
bool faceRecognitionAvailable = false;
bool faceBusy = false;
String lastFaceResultJson;
String faceEngineMessage;

struct FaceProcessingOptions {
  bool detect = false;
  bool recognize = false;
  bool enroll = false;
  bool drawBoxes = false;
  String enrollName;
  String action;
};

struct FaceProcessingOutcome {
  bool ok = false;
  bool detected = false;
  bool recognized = false;
  bool enrolled = false;
  int width = 0;
  int height = 0;
  int faceCount = 0;
  int recognizedId = -1;
  int enrolledId = -1;
  float similarity = 0.0F;
  String matchedName;
  String enrolledName;
  String message;
  String error;
  String facesJson = "[]";
  uint8_t* jpegBuffer = nullptr;
  size_t jpegLength = 0;
};

bool isWiFiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

String escapeJson(const String& value) {
  String escaped;
  escaped.reserve(value.length() + 8);

  for (size_t i = 0; i < value.length(); ++i) {
    const char ch = value.charAt(i);
    switch (ch) {
      case '\\':
        escaped += "\\\\";
        break;
      case '"':
        escaped += "\\\"";
        break;
      case '\n':
        escaped += "\\n";
        break;
      case '\r':
        escaped += "\\r";
        break;
      case '\t':
        escaped += "\\t";
        break;
      default:
        escaped += ch;
        break;
    }
  }

  return escaped;
}

String normalizeIdentityName(String value) {
  value.trim();
  value.replace("\n", " ");
  value.replace("\r", " ");
  value.replace("\t", " ");

  while (value.indexOf("  ") >= 0) {
    value.replace("  ", " ");
  }

  if (value.length() > kMaxEnrollNameLength) {
    value = value.substring(0, kMaxEnrollNameLength);
    value.trim();
  }

  return value;
}

bool queryFlag(const char* name, bool defaultValue = false) {
  if (!webServer.hasArg(name)) {
    return defaultValue;
  }

  String value = webServer.arg(name);
  value.trim();
  value.toLowerCase();
  return value == "1" || value == "true" || value == "yes" || value == "on";
}

int queryInt(const char* name, int defaultValue, int minValue, int maxValue) {
  if (!webServer.hasArg(name)) {
    return defaultValue;
  }

  int value = webServer.arg(name).toInt();
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

String faceRecognitionMode() {
  return "snapshot/manual";
}

void sendCorsHeaders() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  webServer.sendHeader("Access-Control-Allow-Headers", "*");
}

void sendJsonResponse(int statusCode, const String& body) {
  sendCorsHeaders();
  webServer.sendHeader("Cache-Control", "no-store");
  webServer.send(statusCode, "application/json", body);
}

void handleOptions() {
  sendCorsHeaders();
  webServer.send(204, "text/plain", "");
}

String buildSimpleFaceResultJson(bool ok, const String& action, const String& message) {
  String body = "{";
  body += "\"ok\":";
  body += ok ? "true" : "false";
  body += ",\"action\":\"" + escapeJson(action) + "\"";
  body += ",\"message\":\"" + escapeJson(message) + "\"";
  body += ",\"faceDetectionAvailable\":";
  body += faceDetectionAvailable ? "true" : "false";
  body += ",\"faceRecognitionAvailable\":";
  body += faceRecognitionAvailable ? "true" : "false";
  body += ",\"enrolledCount\":" + String(faceRecognitionAvailable ? recognizer.get_enrolled_id_num() : 0);
  body += ",\"faces\":[]";
  body += "}";
  return body;
}

void updateLastFaceResult(const String& body) {
  lastFaceResultJson = body;
}

String buildStatusJson() {
  sensor_t* sensor = esp_camera_sensor_get();
  String body = "{";
  body += "\"deviceId\":\"" + String(kEsp32CamDeviceId) + "\"";
  body += ",\"doorId\":\"" + String(kDoorId) + "\"";
  body += ",\"wifiConnected\":";
  body += isWiFiConnected() ? "true" : "false";
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

bool acquireFaceLock() {
  if (faceBusy) {
    return false;
  }

  faceBusy = true;
  return true;
}

void releaseFaceLock() {
  faceBusy = false;
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

bool initCameraHardware() {
  pinMode(kFlashLedPin, OUTPUT);
  digitalWrite(kFlashLedPin, LOW);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 14;
    config.fb_count = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor != nullptr) {
    sensor->set_framesize(sensor, FRAMESIZE_QVGA);
    sensor->set_brightness(sensor, 1);
    sensor->set_saturation(sensor, -1);
  }

  Serial.println("Camera initialized.");
  return true;
}

void setupFaceEngine() {
  faceDetectionAvailable = psramFound();
  faceRecognitionAvailable = false;

  if (!faceDetectionAvailable) {
    faceEngineMessage = "Face detection needs PSRAM on ESP32-CAM.";
    updateLastFaceResult(buildSimpleFaceResultJson(false, "init", faceEngineMessage));
    return;
  }

  faceDetectorStageOne = new HumanFaceDetectMSR01(
    kFaceDetectScoreThreshold,
    kFaceDetectNmsThreshold,
    kFaceDetectTopK,
    kFaceDetectResizeScale
  );
  faceDetectorStageTwo = new HumanFaceDetectMNP01(
    kFaceKeypointScoreThreshold,
    kFaceKeypointNmsThreshold,
    kFaceKeypointTopK
  );

  if (faceDetectorStageOne == nullptr || faceDetectorStageTwo == nullptr) {
    faceDetectionAvailable = false;
    faceEngineMessage = "Không đủ bộ nhớ để khởi tạo detector model.";
    updateLastFaceResult(buildSimpleFaceResultJson(false, "init", faceEngineMessage));
    return;
  }

  recognizer.set_thresh(kFaceRecognitionThreshold);
  if (recognizer.set_partition(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "fr") != 1) {
    faceEngineMessage = "Face recognition partition 'fr' is unavailable.";
    updateLastFaceResult(buildSimpleFaceResultJson(false, "init", faceEngineMessage));
    return;
  }

  recognizer.set_ids_from_flash();
  faceRecognitionAvailable = true;
  faceEngineMessage = "Face detection ready. Recognition runs in snapshot/manual mode.";
  updateLastFaceResult(buildSimpleFaceResultJson(true, "init", faceEngineMessage));
}

camera_fb_t* captureCameraFrame() {
  if (kUseFlashLed) {
    digitalWrite(kFlashLedPin, HIGH);
    delay(kFlashWarmupMs);
  } else {
    digitalWrite(kFlashLedPin, LOW);
  }

  camera_fb_t* frame = esp_camera_fb_get();
  digitalWrite(kFlashLedPin, LOW);

  if (frame == nullptr) {
    Serial.println("Camera capture failed.");
    sendCameraEvent("CAMERA_ERROR", "Camera capture failed");
  }

  return frame;
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

String buildFacesJson(const std::list<dl::detect::result_t>& results, const FaceProcessingOutcome& outcome) {
  String faces = "[";
  size_t index = 0;

  for (std::list<dl::detect::result_t>::const_iterator prediction = results.begin();
       prediction != results.end() && index < kMaxFaceBoxesInJson;
       ++prediction, ++index) {
    const int x = static_cast<int>(prediction->box[0]);
    const int y = static_cast<int>(prediction->box[1]);
    const int w = static_cast<int>(prediction->box[2]) - x + 1;
    const int h = static_cast<int>(prediction->box[3]) - y + 1;
    const bool matched = outcome.recognized && index == 0;
    const String faceName = matched ? outcome.matchedName : "";
    const float faceSimilarity = matched ? outcome.similarity : 0.0F;

    if (index > 0) {
      faces += ",";
    }

    faces += "{";
    faces += "\"x\":" + String(x);
    faces += ",\"y\":" + String(y);
    faces += ",\"w\":" + String(w);
    faces += ",\"h\":" + String(h);
    faces += ",\"score\":" + String(prediction->score, 4);
    faces += ",\"name\":\"" + escapeJson(faceName) + "\"";
    faces += ",\"similarity\":" + String(faceSimilarity, 4);
    faces += ",\"matched\":";
    faces += matched ? "true" : "false";
    faces += "}";
  }

  faces += "]";
  return faces;
}

uint32_t toFrameColor(fb_data_t* frame, uint32_t color) {
  if (frame->bytes_per_pixel != 2) {
    return color;
  }

  return ((color >> 16) & 0x001F) | ((color >> 3) & 0x07E0) | ((color << 8) & 0xF800);
}

void drawFaceBoxes(fb_data_t* frame, const std::list<dl::detect::result_t>& results, const String& primaryLabel, bool matched) {
  uint32_t lineColor = matched ? 0x0000FF00 : 0x0000FFFF;
  lineColor = toFrameColor(frame, lineColor);

  size_t index = 0;
  for (std::list<dl::detect::result_t>::const_iterator prediction = results.begin();
       prediction != results.end();
       ++prediction, ++index) {
    int x = static_cast<int>(prediction->box[0]);
    int y = static_cast<int>(prediction->box[1]);
    int w = static_cast<int>(prediction->box[2]) - x + 1;
    int h = static_cast<int>(prediction->box[3]) - y + 1;

    if ((x + w) > frame->width) {
      w = frame->width - x;
    }
    if ((y + h) > frame->height) {
      h = frame->height - y;
    }

    fb_gfx_drawFastHLine(frame, x, y, w, lineColor);
    fb_gfx_drawFastHLine(frame, x, y + h - 1, w, lineColor);
    fb_gfx_drawFastVLine(frame, x, y, h, lineColor);
    fb_gfx_drawFastVLine(frame, x + w - 1, y, h, lineColor);

    for (int keypointIndex = 0; keypointIndex + 1 < static_cast<int>(prediction->keypoint.size()); keypointIndex += 2) {
      const int keypointX = prediction->keypoint[keypointIndex];
      const int keypointY = prediction->keypoint[keypointIndex + 1];
      fb_gfx_fillRect(frame, keypointX, keypointY, 3, 3, lineColor);
    }

    if (index == 0 && primaryLabel.length() > 0) {
      int labelY = y > 18 ? y - 18 : y + 6;
      fb_gfx_print(frame, x, labelY, lineColor, primaryLabel.c_str());
    }
  }
}

String buildFaceResultJson(const String& action, const FaceProcessingOutcome& outcome) {
  String body = "{";
  body += "\"ok\":";
  body += outcome.ok ? "true" : "false";
  body += ",\"action\":\"" + escapeJson(action) + "\"";
  body += ",\"message\":\"" + escapeJson(outcome.message) + "\"";
  body += ",\"width\":" + String(outcome.width);
  body += ",\"height\":" + String(outcome.height);
  body += ",\"faceCount\":" + String(outcome.faceCount);
  body += ",\"detected\":";
  body += outcome.detected ? "true" : "false";
  body += ",\"recognized\":";
  body += outcome.recognized ? "true" : "false";
  body += ",\"recognizedId\":" + String(outcome.recognizedId);
  body += ",\"recognizedName\":\"" + escapeJson(outcome.matchedName) + "\"";
  body += ",\"similarity\":" + String(outcome.similarity, 4);
  body += ",\"enrolled\":";
  body += outcome.enrolled ? "true" : "false";
  body += ",\"enrolledId\":" + String(outcome.enrolledId);
  body += ",\"enrolledName\":\"" + escapeJson(outcome.enrolledName) + "\"";
  body += ",\"faceDetectionAvailable\":";
  body += faceDetectionAvailable ? "true" : "false";
  body += ",\"faceRecognitionAvailable\":";
  body += faceRecognitionAvailable ? "true" : "false";
  body += ",\"enrolledCount\":" + String(faceRecognitionAvailable ? recognizer.get_enrolled_id_num() : 0);
  body += ",\"faces\":" + outcome.facesJson;
  body += "}";
  return body;
}

bool processFrameForFace(camera_fb_t* frame, const FaceProcessingOptions& options, FaceProcessingOutcome& outcome, uint8_t jpegQuality = kFaceJpegQuality) {
  if (frame == nullptr) {
    outcome.error = "Camera frame is null.";
    return false;
  }

  outcome.ok = true;
  outcome.width = frame->width;
  outcome.height = frame->height;

  if (!faceDetectionAvailable) {
    outcome.ok = false;
    outcome.error = "Face detection is unavailable on this board configuration.";
    esp_camera_fb_return(frame);
    return false;
  }

  if ((options.recognize || options.enroll) && !faceRecognitionAvailable) {
    outcome.ok = false;
    outcome.error = "Face recognition is unavailable because the flash partition could not be prepared.";
    esp_camera_fb_return(frame);
    return false;
  }

  const size_t rgbLength = static_cast<size_t>(outcome.width) * static_cast<size_t>(outcome.height) * 3U;
  uint8_t* rgbBuffer = static_cast<uint8_t*>(malloc(rgbLength));
  if (rgbBuffer == nullptr) {
    outcome.ok = false;
    outcome.error = "Not enough memory for RGB face processing buffer.";
    esp_camera_fb_return(frame);
    return false;
  }

  const bool converted = fmt2rgb888(frame->buf, frame->len, frame->format, rgbBuffer);
  esp_camera_fb_return(frame);
  if (!converted) {
    free(rgbBuffer);
    outcome.ok = false;
    outcome.error = "Failed to convert frame to RGB888.";
    return false;
  }

  fb_data_t rgbFrame;
  rgbFrame.width = outcome.width;
  rgbFrame.height = outcome.height;
  rgbFrame.bytes_per_pixel = 3;
  rgbFrame.format = FB_BGR888;
  rgbFrame.data = rgbBuffer;

  if (faceDetectorStageOne == nullptr || faceDetectorStageTwo == nullptr) {
    free(rgbBuffer);
    outcome.ok = false;
    outcome.error = "Face detector model is not initialized.";
    return false;
  }

  std::vector<int> shape = {outcome.height, outcome.width, 3};
  std::list<dl::detect::result_t>& candidates = faceDetectorStageOne->infer(rgbBuffer, shape);
  std::list<dl::detect::result_t>& results = faceDetectorStageTwo->infer(rgbBuffer, shape, candidates);

  outcome.faceCount = static_cast<int>(results.size());
  outcome.detected = outcome.faceCount > 0;

  if (outcome.detected) {
    std::list<dl::detect::result_t>::iterator primaryFace = results.begin();
    dl::Tensor<uint8_t> tensor;
    tensor.set_element(rgbBuffer).set_shape({outcome.height, outcome.width, 3}).set_auto_free(false);

    if (options.enroll) {
      if (outcome.faceCount != 1) {
        outcome.ok = false;
        outcome.message = "Đăng ký cần đúng 1 khuôn mặt rõ trong khung hình.";
      } else {
        int enrolledId = recognizer.enroll_id(
          tensor,
          primaryFace->keypoint,
          std::string(options.enrollName.c_str()),
          true
        );

        if (enrolledId >= 0) {
          outcome.enrolled = true;
          outcome.enrolledId = enrolledId;
          outcome.enrolledName = options.enrollName;
          outcome.message = "Đăng ký khuôn mặt thành công.";
        } else {
          outcome.ok = false;
          outcome.message = "Không thể lưu khuôn mặt vào flash.";
        }
      }
    }

    if (options.recognize) {
      face_info_t recognizedFace = recognizer.recognize(tensor, primaryFace->keypoint);
      if (recognizedFace.id >= 0) {
        outcome.recognized = true;
        outcome.recognizedId = recognizedFace.id;
        outcome.similarity = recognizedFace.similarity;
        outcome.matchedName = String(recognizedFace.name.c_str());
        if (outcome.matchedName.length() == 0) {
          outcome.matchedName = "ID " + String(recognizedFace.id);
        }
        if (outcome.message.length() == 0) {
          outcome.message = "Nhận diện được khuôn mặt đã đăng ký.";
        }
      } else if (outcome.message.length() == 0) {
        outcome.message = "Phát hiện mặt nhưng chưa khớp danh tính đã đăng ký.";
      }
    }

    if (!options.recognize && !options.enroll) {
      outcome.message = "Phát hiện được khuôn mặt trong khung hình.";
    }

    if (options.drawBoxes) {
      String label = "Face";
      if (options.enroll) {
        label = outcome.enrolled ? ("Enrolled: " + outcome.enrolledName) : "Enroll failed";
      } else if (options.recognize) {
        label = outcome.recognized ? outcome.matchedName : "Unknown";
      }

      drawFaceBoxes(&rgbFrame, results, label, outcome.recognized || outcome.enrolled);
    }
  } else {
    if (options.enroll) {
      outcome.ok = false;
      outcome.message = "Không phát hiện được khuôn mặt để đăng ký.";
    } else if (options.recognize) {
      outcome.message = "Không phát hiện được khuôn mặt để nhận diện.";
    } else {
      outcome.message = "Không phát hiện khuôn mặt trong khung hình.";
    }
  }

  outcome.facesJson = buildFacesJson(results, outcome);

  if (!fmt2jpg(rgbBuffer, rgbLength, outcome.width, outcome.height, PIXFORMAT_RGB888, jpegQuality, &outcome.jpegBuffer, &outcome.jpegLength)) {
    free(rgbBuffer);
    outcome.ok = false;
    outcome.error = "Failed to encode processed JPEG frame.";
    return false;
  }

  free(rgbBuffer);
  return true;
}

void sendJpegResponse(const uint8_t* data, size_t length) {
  WiFiClient client = webServer.client();
  sendCorsHeaders();
  webServer.sendHeader("Cache-Control", "no-store");
  webServer.setContentLength(length);
  webServer.send(200, "image/jpeg", "");
  client.write(data, length);
}

void handleRoot() {
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

void handleStatus() {
  sendJsonResponse(200, buildStatusJson());
}

void handleFaceLastResult() {
  if (lastFaceResultJson.length() == 0) {
    updateLastFaceResult(buildSimpleFaceResultJson(false, "idle", "Chưa có kết quả xử lý khuôn mặt nào."));
  }

  sendJsonResponse(200, lastFaceResultJson);
}

void handleFaceIds() {
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

void handleFaceDelete() {
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

void handleFaceEnroll() {
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

void handleCapture() {
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

void handleStream() {
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

void handleNotFound() {
  sendCorsHeaders();
  webServer.send(404, "text/plain", "Not found");
}

void startPreviewServer() {
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
  webServer.begin();

  Serial.println("Preview server started.");
  Serial.print("Open web preview with: http://");
  Serial.println(WiFi.localIP());
  Serial.println("Open the repo root index.html and enter that URL.");
}

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

  if (kEnableBackendUpload) {
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
  }

  delay(10);
}
