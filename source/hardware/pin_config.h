#pragma once

#include <Arduino.h>

// ============================================================================
// CẤU HÌNH TOÀN BỘ CHÂN GPIO CỦA HỆ THỐNG
// Chỉ sửa các giá trị trong file này khi thay đổi cách đấu dây.
// Sau khi sửa phải build và nạp lại đúng firmware tương ứng.
// ============================================================================

namespace HardwarePins {

namespace MainController {

// RFID MFRC522 (SPI)
constexpr uint8_t kRfidSs = 5;
constexpr uint8_t kRfidReset = 16;
constexpr uint8_t kRfidClock = 18;
constexpr uint8_t kRfidMiso = 19;
constexpr uint8_t kRfidMosi = 23;

// Cơ cấu cửa và tín hiệu
constexpr uint8_t kServo = 26;
constexpr uint8_t kGreenLed = 32;
constexpr uint8_t kRedLed = 33;
constexpr uint8_t kBuzzer = 21;
constexpr uint8_t kSafetyButton = 17;

// Cảm biến siêu âm HC-SR04
constexpr uint8_t kUltrasonicTrigger = 12;
constexpr uint8_t kUltrasonicEcho = 13;

}  // namespace MainController

namespace Esp32Cam {

// Pin map chuẩn cho board AI Thinker ESP32-CAM.
constexpr int8_t kPowerDown = 32;
constexpr int8_t kReset = -1;
constexpr int8_t kXclk = 0;
constexpr int8_t kSiod = 26;
constexpr int8_t kSioc = 27;

constexpr int8_t kData7 = 35;  // Y9
constexpr int8_t kData6 = 34;  // Y8
constexpr int8_t kData5 = 39;  // Y7
constexpr int8_t kData4 = 36;  // Y6
constexpr int8_t kData3 = 21;  // Y5
constexpr int8_t kData2 = 19;  // Y4
constexpr int8_t kData1 = 18;  // Y3
constexpr int8_t kData0 = 5;   // Y2

constexpr int8_t kVsync = 25;
constexpr int8_t kHref = 23;
constexpr int8_t kPclk = 22;
constexpr uint8_t kFlashLed = 4;

}  // namespace Esp32Cam

}  // namespace HardwarePins
