#pragma once

#include <Arduino.h>
#include <vector>

struct FaceProcessingOptions {
  bool detect = false;
  bool recognize = false;
  bool extractEmbedding = false;
  bool enroll = false;
  bool drawBoxes = false;
  bool encodeJpeg = true;
  bool returnFrameToCamera = true;
  bool requireSingleFaceForEmbedding = false;
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
  float detectionScore = 0.0F;
  bool embeddingExtracted = false;
  String matchedName;
  String enrolledName;
  String embeddingModel;
  String message;
  String error;
  String facesJson = "[]";
  std::vector<float> embedding;
  uint8_t* jpegBuffer = nullptr;
  size_t jpegLength = 0;
};
