#pragma once

#include <Arduino.h>
#include <WebServer.h>

#if defined(ESP32CAM_FORCE_NO_FACE_MODELS)
  #define ESP32CAM_HAS_FACE_MODELS 0
#elif defined(__has_include)
  #if __has_include("model_zoo/face_recognition_112_v1_s8.hpp") && \
      __has_include("model_zoo/human_face_detect_mnp01.hpp") && \
      __has_include("model_zoo/human_face_detect_msr01.hpp")
    #define ESP32CAM_HAS_FACE_MODELS 1
  #elif __has_include("esp-dl/model_zoo/face_recognition_112_v1_s8.hpp") && \
        __has_include("esp-dl/model_zoo/human_face_detect_mnp01.hpp") && \
        __has_include("esp-dl/model_zoo/human_face_detect_msr01.hpp")
    #define ESP32CAM_HAS_FACE_MODELS 2
  #else
    #define ESP32CAM_HAS_FACE_MODELS 0
  #endif
#else
  #define ESP32CAM_HAS_FACE_MODELS 0
#endif

#if ESP32CAM_HAS_FACE_MODELS == 1
  #include "model_zoo/face_recognition_112_v1_s8.hpp"
  #include "model_zoo/human_face_detect_mnp01.hpp"
  #include "model_zoo/human_face_detect_msr01.hpp"
#elif ESP32CAM_HAS_FACE_MODELS == 2
  #include "esp-dl/model_zoo/face_recognition_112_v1_s8.hpp"
  #include "esp-dl/model_zoo/human_face_detect_mnp01.hpp"
  #include "esp-dl/model_zoo/human_face_detect_msr01.hpp"
#endif

static WebServer webServer(80);

#if ESP32CAM_HAS_FACE_MODELS
  static FaceRecognition112V1S8 recognizer;
  static HumanFaceDetectMSR01* faceDetectorStageOne = nullptr;
  static HumanFaceDetectMNP01* faceDetectorStageTwo = nullptr;
#endif

static unsigned long lastSnapshotTime = 0;
static bool cameraReady = false;
static bool faceDetectionAvailable = false;
static bool faceRecognitionAvailable = false;
static bool faceBusy = false;
static String lastFaceResultJson;
static String faceEngineMessage;

static size_t enrolledFaceCount() {
#if ESP32CAM_HAS_FACE_MODELS
  return faceRecognitionAvailable ? recognizer.get_enrolled_id_num() : 0;
#else
  return 0;
#endif
}
