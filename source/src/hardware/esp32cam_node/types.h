#pragma once

#include <Arduino.h>

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
