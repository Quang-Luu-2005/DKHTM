#pragma once

#include <Arduino.h>

// Update these values before uploading.
constexpr char kWifiSsid[] = "Phíchhh";
constexpr char kWifiPass[] = "canhacungvui";
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
