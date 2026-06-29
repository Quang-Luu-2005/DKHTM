#pragma once

#include <Arduino.h>

// RFID RC522 pins for ESP32 DevKit / ESP32 38-pin boards.
constexpr uint8_t kRfidSsPin = 5;
constexpr uint8_t kRfidRstPin = 22;
constexpr uint8_t kRfidSckPin = 18;
constexpr uint8_t kRfidMisoPin = 19;
constexpr uint8_t kRfidMosiPin = 23;

// Gate actuator.
constexpr uint8_t kServoPin = 13;
constexpr int kLockAngle = 0;
constexpr int kUnlockAngle = 90;
constexpr unsigned long kUnlockDurationMs = 3000UL;

// Local outputs.
constexpr uint8_t kBuzzerPin = 27;
constexpr uint8_t kLedGreenPin = 26;
constexpr uint8_t kLedRedPin = 25;

// Sensors and manual exit button.
constexpr uint8_t kPersonIrPin = 34;
constexpr uint8_t kGateTopIrPin = 35;
constexpr uint8_t kExitButtonPin = 33;
constexpr uint8_t kDoorSensorPin = 32;

// Many IR modules output LOW when blocked. Change to false if yours outputs HIGH.
constexpr bool kIrActiveLow = true;

// Servo power note: use a separate 5V supply and connect its GND to ESP32 GND.
// RC522 note: power the module from 3.3V, not 5V.
