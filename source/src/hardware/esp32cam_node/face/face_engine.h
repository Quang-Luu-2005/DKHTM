#pragma once

#include <Arduino.h>
#include "esp_camera.h"

#include "../core/config.h"
#include "../core/types.h"

bool acquireFaceLock();
void releaseFaceLock();
void setupFaceEngine();
String buildSimpleFaceResultJson(bool ok, const String& action, const String& message);
void updateLastFaceResult(const String& body);
String buildFaceResultJson(const String& action, const FaceProcessingOutcome& outcome);
bool processFrameForFace(
  camera_fb_t* frame,
  const FaceProcessingOptions& options,
  FaceProcessingOutcome& outcome,
  uint8_t jpegQuality = kFaceJpegQuality
);
