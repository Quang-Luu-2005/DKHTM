#pragma once

// Copy this file to source/include/config/secrets.h before flashing.
// The backend URL must be reachable from the ESP32 over the LAN; do not use localhost.

#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASS "YOUR_WIFI_PASSWORD"

#define SERVER_BASE_URL "http://192.168.1.10:3000"
#define DEVICE_SECRET "demo-secret"

#define ESP32_CAM_DEVICE_ID "ESP32CAM_001"
#define ESP32_MAIN_DEVICE_ID "ESP32_MAIN_001"
#define DOOR_ID "GATE_01"
