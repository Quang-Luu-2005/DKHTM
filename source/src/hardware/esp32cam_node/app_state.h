#pragma once

#include <Arduino.h>
#include <WebServer.h>

#include "model_zoo/face_recognition_112_v1_s8.hpp"
#include "model_zoo/human_face_detect_mnp01.hpp"
#include "model_zoo/human_face_detect_msr01.hpp"

static WebServer webServer(80);
static FaceRecognition112V1S8 recognizer;
static HumanFaceDetectMSR01* faceDetectorStageOne = nullptr;
static HumanFaceDetectMNP01* faceDetectorStageTwo = nullptr;

static unsigned long lastSnapshotTime = 0;
static bool cameraReady = false;
static bool faceDetectionAvailable = false;
static bool faceRecognitionAvailable = false;
static bool faceBusy = false;
static String lastFaceResultJson;
static String faceEngineMessage;
