#pragma once

#include <Arduino.h>
#include "../pin_config.h"

namespace ControllerConfig {

// Wi-Fi và backend phải cùng mạng LAN với ESP32-CAM.
constexpr char kWifiSsid[] = "Phíchhh";
constexpr char kWifiPass[] = "canhacungvui";
constexpr char kBackendBaseUrl[] = "http://192.168.1.31:3001";
constexpr char kDeviceSecret[] = "demo-secret";
constexpr char kDeviceId[] = "MAIN_CONTROLLER_001";
constexpr char kGateId[] = "GATE_01";

constexpr int kWifiMaxRetries = 30;
constexpr unsigned long kWifiRetryDelayMs = 500UL;
constexpr unsigned long kHttpTimeoutMs = 5000UL;
constexpr unsigned long kHeartbeatIntervalMs = 30000UL;

constexpr int kLockedAngle = 0;
constexpr int kUnlockedAngle = 70;
constexpr unsigned long kUnlockDurationMs = 5000UL;
constexpr unsigned long kDeniedSignalDurationMs = 1000UL;
constexpr unsigned long kSensorPollIntervalMs = 200UL;
constexpr unsigned long kPresenceEventCooldownMs = 3000UL;
constexpr int kRecognitionDistanceCm = 80;

}  // namespace ControllerConfig
