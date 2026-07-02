#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include "esp_camera.h"

// Update these values before uploading.
constexpr char kWifiSsid[] = "YOUR_WIFI_NAME";
constexpr char kWifiPass[] = "YOUR_WIFI_PASSWORD";
constexpr char kServerBaseUrl[] = "http://192.168.1.10:3000";
constexpr char kDeviceSecret[] = "demo-secret";
constexpr char kEsp32CamDeviceId[] = "ESP32CAM_001";
constexpr char kDoorId[] = "GATE_01";

constexpr unsigned long kWifiRetryDelayMs = 500UL;
constexpr int kWifiMaxRetries = 30;
constexpr unsigned long kHttpTimeoutMs = 5000UL;
constexpr unsigned long kSnapshotIntervalMs = 10000UL;
constexpr uint8_t kFlashLedPin = 4;
constexpr unsigned long kFlashWarmupMs = 150UL;

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

unsigned long lastSnapshotTime = 0;
bool cameraReady = false;

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
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  Serial.println("Camera initialized.");
  return true;
}

camera_fb_t* captureCameraFrame() {
  digitalWrite(kFlashLedPin, HIGH);
  delay(kFlashWarmupMs);

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
