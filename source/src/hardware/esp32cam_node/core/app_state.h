#pragma once

#include <Arduino.h>
#include <WebServer.h>

#include "face_recognition_112_v1_s8.hpp"
#include "human_face_detect_mnp01.hpp"
#include "human_face_detect_msr01.hpp"

extern WebServer webServer;
extern FaceRecognition112V1S8 recognizer;
extern HumanFaceDetectMSR01* faceDetectorStageOne;
extern HumanFaceDetectMNP01* faceDetectorStageTwo;

extern unsigned long lastSnapshotTime;
extern bool cameraReady;
extern bool faceDetectionAvailable;
extern bool faceRecognitionAvailable;
extern bool faceBusy;
extern String lastFaceResultJson;
extern String faceEngineMessage;
