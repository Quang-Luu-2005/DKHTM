#pragma once

#include <Arduino.h>

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

// Sơ đồ chân được giữ theo dự án DKHTM-Van/ESP32-Automatic-Gate.
constexpr uint8_t kRfidSsPin = 5;
constexpr uint8_t kRfidRstPin = 16;
constexpr uint8_t kRfidSckPin = 18;
constexpr uint8_t kRfidMisoPin = 19;
constexpr uint8_t kRfidMosiPin = 23;
constexpr uint8_t kServoPin = 26;
constexpr uint8_t kGreenLedPin = 32;
constexpr uint8_t kRedLedPin = 33;
constexpr uint8_t kUltrasonicTrigPin = 12;
constexpr uint8_t kUltrasonicEchoPin = 13;
constexpr uint8_t kBuzzerPin = 21;
constexpr uint8_t kButtonPin = 17;

constexpr int kLockedAngle = 0;
constexpr int kUnlockedAngle = 70;
constexpr unsigned long kUnlockDurationMs = 5000UL;
constexpr unsigned long kDeniedSignalDurationMs = 1000UL;
constexpr unsigned long kSensorPollIntervalMs = 200UL;
constexpr unsigned long kViolationCooldownMs = 8000UL;
constexpr int kViolationDistanceCm = 6;

}  // namespace ControllerConfig
