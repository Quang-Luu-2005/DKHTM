#pragma once

#include <Arduino.h>
#include "../pin_config.h"

// Update these values before uploading.
constexpr char kWifiSsid[] = "Phíchhh";
constexpr char kWifiPass[] = "canhacungvui";
// Use the LAN IP of the computer running software/backend (not localhost).
constexpr char kServerBaseUrl[] = "http://192.168.1.31:3001";
constexpr char kDeviceSecret[] = "demo-secret";
constexpr char kEsp32CamDeviceId[] = "ESP32CAM_001";
constexpr char kDoorId[] = "GATE_01";

constexpr bool kEnableBackendUpload = true;

constexpr unsigned long kWifiRetryDelayMs = 500UL;
constexpr int kWifiMaxRetries = 30;
constexpr unsigned long kHttpTimeoutMs = 5000UL;
constexpr bool kAutomaticRecognitionEnabled = true;
constexpr bool kUploadRecognitionSnapshot = true;
constexpr unsigned long kRecognitionIntervalMs = 1500UL;
constexpr unsigned long kHeartbeatIntervalMs = 30000UL;
constexpr unsigned long kStreamFrameDelayMs = 10UL;
constexpr bool kUseFlashLed = false;
constexpr unsigned long kFlashWarmupMs = 150UL;

constexpr char kFaceEmbeddingModel[] = "FaceRecognition112V1S8";
constexpr size_t kMaxFaceEmbeddingDimension = 1024;
constexpr size_t kMaxEmbeddingUploadBytes = 192U * 1024U;
constexpr uint16_t kEmbeddingUploadWidth = 320;
constexpr uint16_t kEmbeddingUploadHeight = 240;

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
