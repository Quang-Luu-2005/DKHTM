#pragma once

#include <Arduino.h>
#include "esp_camera.h"

#include "app_state.h"
#include "config.h"
#include "web_server.h"

namespace CameraPins = HardwarePins::Esp32Cam;

static String sendCameraEvent(const String& eventType, const String& message);

static bool initCameraHardware() {
  pinMode(CameraPins::kFlashLed, OUTPUT);
  digitalWrite(CameraPins::kFlashLed, LOW);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CameraPins::kData0;
  config.pin_d1 = CameraPins::kData1;
  config.pin_d2 = CameraPins::kData2;
  config.pin_d3 = CameraPins::kData3;
  config.pin_d4 = CameraPins::kData4;
  config.pin_d5 = CameraPins::kData5;
  config.pin_d6 = CameraPins::kData6;
  config.pin_d7 = CameraPins::kData7;
  config.pin_xclk = CameraPins::kXclk;
  config.pin_pclk = CameraPins::kPclk;
  config.pin_vsync = CameraPins::kVsync;
  config.pin_href = CameraPins::kHref;
  config.pin_sccb_sda = CameraPins::kSiod;
  config.pin_sccb_scl = CameraPins::kSioc;
  config.pin_pwdn = CameraPins::kPowerDown;
  config.pin_reset = CameraPins::kReset;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 14;
    config.fb_count = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor != nullptr) {
    sensor->set_framesize(sensor, FRAMESIZE_QVGA);
    sensor->set_brightness(sensor, 1);
    sensor->set_saturation(sensor, -1);
  }

  Serial.println("Camera initialized.");
  return true;
}

static camera_fb_t* captureCameraFrame() {
  if (kUseFlashLed) {
    digitalWrite(CameraPins::kFlashLed, HIGH);
    delay(kFlashWarmupMs);
  } else {
    digitalWrite(CameraPins::kFlashLed, LOW);
  }

  camera_fb_t* frame = esp_camera_fb_get();
  digitalWrite(CameraPins::kFlashLed, LOW);

  if (frame == nullptr) {
    Serial.println("Camera capture failed.");
    sendCameraEvent("CAMERA_ERROR", "Camera capture failed");
  }

  return frame;
}

static void sendJpegResponse(const uint8_t* data, size_t length) {
  WiFiClient client = webServer.client();
  sendCorsHeaders();
  webServer.sendHeader("Cache-Control", "no-store");
  webServer.setContentLength(length);
  webServer.send(200, "image/jpeg", "");
  client.write(data, length);
}
