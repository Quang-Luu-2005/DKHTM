#pragma once

#include "esp_camera.h"

bool initCameraHardware();
camera_fb_t* captureCameraFrame();
void releaseCameraFrame(camera_fb_t* frame);
