#pragma once

#include <Arduino.h>
#include "esp_camera.h"

bool initCameraHardware();
camera_fb_t* captureCameraFrame();
void sendJpegResponse(const uint8_t* data, size_t length);
