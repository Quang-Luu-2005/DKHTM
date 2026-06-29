#pragma once

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_WIFI_NAME"
#endif

#ifndef WIFI_PASS
#define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif

#ifndef SERVER_BASE_URL
#define SERVER_BASE_URL "http://192.168.1.10:3000"
#endif

#ifndef DEVICE_SECRET
#define DEVICE_SECRET "demo-secret"
#endif

#ifndef ESP32_CAM_DEVICE_ID
#define ESP32_CAM_DEVICE_ID "ESP32CAM_001"
#endif

#ifndef ESP32_MAIN_DEVICE_ID
#define ESP32_MAIN_DEVICE_ID "ESP32_MAIN_001"
#endif

#ifndef DOOR_ID
#define DOOR_ID "GATE_01"
#endif

constexpr const char* kWifiSsid = WIFI_SSID;
constexpr const char* kWifiPass = WIFI_PASS;
constexpr const char* kServerBaseUrl = SERVER_BASE_URL;
constexpr const char* kDeviceSecret = DEVICE_SECRET;
constexpr const char* kEsp32CamDeviceId = ESP32_CAM_DEVICE_ID;
constexpr const char* kEsp32MainDeviceId = ESP32_MAIN_DEVICE_ID;
constexpr const char* kDoorId = DOOR_ID;

constexpr unsigned long kWifiRetryDelayMs = 500UL;
constexpr int kWifiMaxRetries = 30;
constexpr unsigned long kHttpTimeoutMs = 5000UL;

constexpr unsigned long kSnapshotIntervalMs = 10000UL;
constexpr unsigned long kHeartbeatIntervalMs = 15000UL;
constexpr unsigned long kIntrusionCooldownMs = 10000UL;
