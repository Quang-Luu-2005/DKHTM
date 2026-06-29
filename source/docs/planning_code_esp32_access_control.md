# Kế hoạch coding hệ thống kiểm soát ra vào thông minh

> Project triển khai theo kiến trúc: **ESP32-CAM + ESP32 mạch chính + servo mở khóa cổng + RFID/NFC + cảm biến + web dashboard**.

---

## 1. Tổng quan hệ thống

Hệ thống gồm 3 phần chính:

1. **ESP32-CAM**
   - Chụp ảnh khu vực cổng.
   - Gửi ảnh hoặc event camera lên backend.
   - Có thể dùng để kiểm tra người đứng trước cửa.
   - Phần AI nhận diện nên xử lý ở backend để dễ debug và ổn định hơn.

2. **ESP32 mạch chính**
   - Đọc thẻ RFID/NFC RC522.
   - Điều khiển servo mở khóa cổng.
   - Đọc cảm biến người đến gần.
   - Đọc cảm biến vượt cổng.
   - Điều khiển LED và buzzer.
   - Gửi log ra vào và cảnh báo lên backend.

3. **Backend + Web Dashboard**
   - Xác thực RFID.
   - Nhận log từ thiết bị.
   - Nhận ảnh từ ESP32-CAM.
   - Lưu lịch sử ra vào.
   - Hiển thị cảnh báo.
   - Quản lý người dùng, thẻ RFID/NFC, trạng thái cổng.

---

## 2. Kiến trúc triển khai

```text
ESP32-CAM
  └── Chụp ảnh / gửi sự kiện camera
      └── POST lên backend

ESP32 mạch chính
  ├── Đọc RFID RC522
  ├── Điều khiển servo mở khóa cổng
  ├── Đọc cảm biến hồng ngoại / cảm biến cổng
  ├── Điều khiển LED + buzzer
  └── POST log / cảnh báo lên backend

Backend
  ├── Nhận log ra vào
  ├── Xác thực thẻ RFID
  ├── Nhận ảnh từ ESP32-CAM
  └── Đẩy dữ liệu lên web dashboard
```

---

## 3. API backend dự kiến

Backend giả định có 3 API chính:

```text
POST /api/device/events
POST /api/device/rfid/verify
POST /api/device/camera/snapshot
```

### 3.1. API nhận event từ thiết bị

```text
POST /api/device/events
```

Ví dụ payload:

```json
{
  "deviceId": "ESP32_MAIN_001",
  "doorId": "GATE_01",
  "source": "ESP32_MAIN",
  "eventType": "ACCESS_GRANTED",
  "message": "RFID card accepted",
  "cardUid": "A1B2C3D4",
  "personName": "Luu Huy Minh Quang",
  "gateUnlocked": true,
  "doorOpen": false,
  "personNearGate": true
}
```

Các loại `eventType` nên dùng:

```text
DEVICE_ONLINE
DEVICE_HEARTBEAT
ACCESS_GRANTED
ACCESS_DENIED
GATE_LOCKED
INTRUSION_DETECTED
CAMERA_ONLINE
CAMERA_ERROR
SNAPSHOT_UPLOADED
SNAPSHOT_UPLOAD_FAILED
PERSON_CHECK
```

---

### 3.2. API xác thực RFID

```text
POST /api/device/rfid/verify
```

ESP32 gửi:

```json
{
  "deviceId": "ESP32_MAIN_001",
  "doorId": "GATE_01",
  "cardUid": "A1B2C3D4"
}
```

Backend trả về nếu hợp lệ:

```json
{
  "allow": true,
  "personName": "Luu Huy Minh Quang"
}
```

Backend trả về nếu không hợp lệ:

```json
{
  "allow": false,
  "personName": ""
}
```

---

### 3.3. API nhận ảnh từ ESP32-CAM

```text
POST /api/device/camera/snapshot?deviceId=ESP32CAM_001&doorId=GATE_01
```

Header:

```text
Content-Type: image/jpeg
x-device-secret: demo-secret
```

Body:

```text
Dữ liệu ảnh JPEG từ ESP32-CAM
```

---

## 4. Cổng GPIO cho ESP32 mạch chính

Dùng cho **ESP32 38 pin / ESP32 DevKit / ESP32 WiFi ROHS**.

| Thiết bị | GPIO | Ghi chú |
|---|---:|---|
| RC522 SDA / SS | GPIO 5 | SPI SS |
| RC522 SCK | GPIO 18 | SPI Clock |
| RC522 MOSI | GPIO 23 | SPI MOSI |
| RC522 MISO | GPIO 19 | SPI MISO |
| RC522 RST | GPIO 22 | Reset RC522 |
| Servo mở khóa cổng | GPIO 13 | PWM servo |
| Buzzer | GPIO 27 | Báo động |
| LED xanh | GPIO 26 | Thành công |
| LED đỏ | GPIO 25 | Từ chối / cảnh báo |
| Cảm biến người đến gần | GPIO 34 | Input-only |
| Cảm biến vượt cổng | GPIO 35 | Input-only |
| Nút mở từ bên trong | GPIO 33 | INPUT_PULLUP |
| Cảm biến cửa | GPIO 32 | INPUT_PULLUP |

### Lưu ý nguồn điện

```text
RC522 dùng 3.3V, không cấp 5V.
Servo nên dùng nguồn 5V riêng.
GND nguồn servo phải nối chung GND với ESP32.
```

---

## 5. Thư viện cần cài trong Arduino IDE

Cài board:

```text
esp32 by Espressif Systems
```

Cài thư viện trong **Library Manager**:

```text
MFRC522
ESP32Servo
ArduinoJson
```

Thư viện có sẵn sau khi cài ESP32 core:

```text
WiFi.h
HTTPClient.h
esp_camera.h
SPI.h
```

Board cần chọn:

```text
ESP32-CAM: AI Thinker ESP32-CAM
ESP32 mạch chính: ESP32 Dev Module
```

---

# 6. Source cho ESP32-CAM

File đề xuất:

```text
esp32_cam_node.ino
```

Nhiệm vụ:

- Kết nối Wi-Fi.
- Khởi tạo camera AI Thinker ESP32-CAM.
- Định kỳ chụp ảnh.
- Upload ảnh JPEG lên backend.
- Gửi event camera lên backend.

```cpp
#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

// =======================
// WIFI CONFIG
// =======================
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// =======================
// BACKEND CONFIG
// =======================
const char* SERVER_BASE_URL = "http://192.168.1.10:3000";
const char* DEVICE_SECRET = "demo-secret";

const char* DEVICE_ID = "ESP32CAM_001";
const char* DOOR_ID = "GATE_01";

// =======================
// CAMERA PIN CONFIG
// AI THINKER ESP32-CAM
// =======================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5

#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// =======================
// TIMING
// =======================
unsigned long lastSnapshotTime = 0;
const unsigned long SNAPSHOT_INTERVAL_MS = 10000;

// =======================
// WIFI
// =======================
void connectWiFi() {
  Serial.print("Connecting WiFi");

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connection failed.");
  }
}

// =======================
// CAMERA INIT
// =======================
bool initCamera() {
  camera_config_t config;

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;

  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;

  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);

  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  Serial.println("Camera initialized.");
  return true;
}

// =======================
// SEND CAMERA EVENT
// =======================
void sendCameraEvent(const String& eventType, const String& message) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skip event.");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  String url = String(SERVER_BASE_URL) + "/api/device/events";

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["doorId"] = DOOR_ID;
  doc["source"] = "ESP32_CAM";
  doc["eventType"] = eventType;
  doc["message"] = message;
  doc["confidence"] = 0.90;

  String body;
  serializeJson(doc, body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", DEVICE_SECRET);

  int statusCode = http.POST(body);

  Serial.print("Send camera event status: ");
  Serial.println(statusCode);

  http.end();
}

// =======================
// UPLOAD SNAPSHOT
// =======================
void uploadSnapshot() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skip snapshot.");
    return;
  }

  camera_fb_t* fb = esp_camera_fb_get();

  if (!fb) {
    Serial.println("Camera capture failed.");
    sendCameraEvent("CAMERA_ERROR", "Camera capture failed");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  String url = String(SERVER_BASE_URL)
             + "/api/device/camera/snapshot"
             + "?deviceId=" + DEVICE_ID
             + "&doorId=" + DOOR_ID;

  http.begin(client, url);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-device-secret", DEVICE_SECRET);

  int statusCode = http.POST(fb->buf, fb->len);

  Serial.print("Upload snapshot status: ");
  Serial.println(statusCode);

  http.end();
  esp_camera_fb_return(fb);

  if (statusCode >= 200 && statusCode < 300) {
    sendCameraEvent("SNAPSHOT_UPLOADED", "Camera snapshot uploaded");
  } else {
    sendCameraEvent("SNAPSHOT_UPLOAD_FAILED", "Camera snapshot upload failed");
  }
}

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);
  delay(1000);

  connectWiFi();

  bool cameraOk = initCamera();

  if (cameraOk) {
    sendCameraEvent("CAMERA_ONLINE", "ESP32-CAM is online");
  } else {
    sendCameraEvent("CAMERA_ERROR", "ESP32-CAM init failed");
  }
}

// =======================
// LOOP
// =======================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastSnapshotTime >= SNAPSHOT_INTERVAL_MS) {
    lastSnapshotTime = now;

    sendCameraEvent("PERSON_CHECK", "Camera checking gate area");
    uploadSnapshot();
  }

  delay(200);
}
```

---

# 7. Source cho ESP32 mạch chính

File đề xuất:

```text
esp32_main_controller.ino
```

Nhiệm vụ:

- Đọc thẻ RFID RC522.
- Gửi UID thẻ lên backend để xác thực.
- Nếu hợp lệ: servo mở khóa cổng.
- Nếu sai: LED đỏ + buzzer.
- Nếu cảm biến vượt cổng bị kích hoạt: báo động và gửi cảnh báo.
- Gửi log lên backend.

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include <SPI.h>
#include <MFRC522.h>

#include <ESP32Servo.h>

// =======================
// WIFI CONFIG
// =======================
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// =======================
// BACKEND CONFIG
// =======================
const char* SERVER_BASE_URL = "http://192.168.1.10:3000";
const char* DEVICE_SECRET = "demo-secret";

const char* DEVICE_ID = "ESP32_MAIN_001";
const char* DOOR_ID = "GATE_01";

// =======================
// PIN CONFIG
// =======================

// RFID RC522
#define RFID_SS_PIN   5
#define RFID_RST_PIN  22
#define RFID_SCK_PIN  18
#define RFID_MISO_PIN 19
#define RFID_MOSI_PIN 23

// Servo
#define SERVO_PIN 13

// Output
#define BUZZER_PIN    27
#define LED_GREEN_PIN 26
#define LED_RED_PIN   25

// Sensors
#define PERSON_IR_PIN    34
#define GATE_TOP_IR_PIN  35
#define EXIT_BUTTON_PIN  33
#define DOOR_SENSOR_PIN  32

// =======================
// SERVO CONFIG
// =======================
const int LOCK_ANGLE = 0;
const int UNLOCK_ANGLE = 90;
const int UNLOCK_DURATION_MS = 3000;

// =======================
// SENSOR CONFIG
// =======================
// Nhiều module IR xuất LOW khi có vật cản.
// Đổi thành false nếu module của bạn xuất HIGH khi có vật cản.
const bool IR_ACTIVE_LOW = true;

// =======================
// OBJECTS
// =======================
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
Servo gateServo;

// =======================
// STATE
// =======================
bool gateUnlocked = false;

unsigned long lastIntrusionAlertTime = 0;
const unsigned long INTRUSION_COOLDOWN_MS = 10000;

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;

// =======================
// WIFI
// =======================
void connectWiFi() {
  Serial.print("Connecting WiFi");

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connection failed.");
  }
}

// =======================
// BASIC OUTPUT
// =======================
void beep(int times, int durationMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, LOW);
    delay(durationMs);
  }
}

void setIdleLed() {
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);
}

void signalGranted() {
  digitalWrite(LED_GREEN_PIN, HIGH);
  digitalWrite(LED_RED_PIN, LOW);
  beep(1, 120);
}

void signalDenied() {
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN, HIGH);
  beep(3, 120);
  delay(500);
  setIdleLed();
}

void signalAlert() {
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN, HIGH);
  beep(5, 100);
  setIdleLed();
}

// =======================
// SENSOR READ
// =======================
bool isIrActive(int pin) {
  int value = digitalRead(pin);

  if (IR_ACTIVE_LOW) {
    return value == LOW;
  }

  return value == HIGH;
}

bool isPersonNearGate() {
  return isIrActive(PERSON_IR_PIN);
}

bool isGateTopBlocked() {
  return isIrActive(GATE_TOP_IR_PIN);
}

bool isExitButtonPressed() {
  return digitalRead(EXIT_BUTTON_PIN) == LOW;
}

bool isDoorOpen() {
  return digitalRead(DOOR_SENSOR_PIN) == LOW;
}

// =======================
// SEND EVENT TO BACKEND
// =======================
void sendDeviceEvent(
  const String& eventType,
  const String& message,
  const String& cardUid = "",
  const String& personName = ""
) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skip event.");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  String url = String(SERVER_BASE_URL) + "/api/device/events";

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["doorId"] = DOOR_ID;
  doc["source"] = "ESP32_MAIN";
  doc["eventType"] = eventType;
  doc["message"] = message;
  doc["cardUid"] = cardUid;
  doc["personName"] = personName;
  doc["gateUnlocked"] = gateUnlocked;
  doc["doorOpen"] = isDoorOpen();
  doc["personNearGate"] = isPersonNearGate();

  String body;
  serializeJson(doc, body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", DEVICE_SECRET);

  int statusCode = http.POST(body);

  Serial.print("Send event ");
  Serial.print(eventType);
  Serial.print(" status: ");
  Serial.println(statusCode);

  http.end();
}

// =======================
// RFID
// =======================
String readCardUid() {
  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uid += "0";
    }

    uid += String(rfid.uid.uidByte[i], HEX);
  }

  uid.toUpperCase();
  return uid;
}

bool verifyCardWithBackend(const String& cardUid, String& personName) {
  personName = "";

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Deny access.");
    return false;
  }

  WiFiClient client;
  HTTPClient http;

  String url = String(SERVER_BASE_URL) + "/api/device/rfid/verify";

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["doorId"] = DOOR_ID;
  doc["cardUid"] = cardUid;

  String body;
  serializeJson(doc, body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", DEVICE_SECRET);

  int statusCode = http.POST(body);
  String response = http.getString();

  Serial.print("Verify card status: ");
  Serial.println(statusCode);
  Serial.print("Verify response: ");
  Serial.println(response);

  http.end();

  if (statusCode < 200 || statusCode >= 300) {
    return false;
  }

  StaticJsonDocument<256> resDoc;
  DeserializationError error = deserializeJson(resDoc, response);

  if (error) {
    Serial.println("Parse verify response failed.");
    return false;
  }

  bool allow = resDoc["allow"] | false;
  const char* name = resDoc["personName"] | "";

  personName = String(name);

  return allow;
}

// =======================
// GATE CONTROL
// =======================
void lockGate() {
  gateServo.write(LOCK_ANGLE);
  gateUnlocked = false;

  Serial.println("Gate locked.");
  sendDeviceEvent("GATE_LOCKED", "Gate locked");
}

void unlockGate(const String& reason, const String& cardUid = "", const String& personName = "") {
  Serial.println("Unlocking gate...");

  gateUnlocked = true;
  gateServo.write(UNLOCK_ANGLE);

  signalGranted();

  sendDeviceEvent("ACCESS_GRANTED", reason, cardUid, personName);

  delay(UNLOCK_DURATION_MS);

  lockGate();
}

// =======================
// HANDLE RFID
// =======================
void handleRfid() {
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  String cardUid = readCardUid();

  Serial.print("Card UID: ");
  Serial.println(cardUid);

  String personName = "";
  bool allowed = verifyCardWithBackend(cardUid, personName);

  if (allowed) {
    unlockGate("RFID card accepted", cardUid, personName);
  } else {
    Serial.println("Access denied.");

    signalDenied();

    sendDeviceEvent(
      "ACCESS_DENIED",
      "RFID card rejected",
      cardUid,
      ""
    );
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(500);
}

// =======================
// HANDLE INTRUSION
// =======================
void handleIntrusion() {
  bool intrusionDetected = isGateTopBlocked();

  if (!intrusionDetected) {
    return;
  }

  if (gateUnlocked) {
    return;
  }

  unsigned long now = millis();

  if (now - lastIntrusionAlertTime < INTRUSION_COOLDOWN_MS) {
    return;
  }

  lastIntrusionAlertTime = now;

  Serial.println("Intrusion detected!");

  signalAlert();

  sendDeviceEvent(
    "INTRUSION_DETECTED",
    "Detected climbing or jumping over the gate"
  );
}

// =======================
// HANDLE EXIT BUTTON
// =======================
void handleExitButton() {
  if (!isExitButtonPressed()) {
    return;
  }

  Serial.println("Exit button pressed.");

  unlockGate("Exit button pressed");

  delay(500);
}

// =======================
// HEARTBEAT
// =======================
void sendHeartbeat() {
  unsigned long now = millis();

  if (now - lastHeartbeatTime < HEARTBEAT_INTERVAL_MS) {
    return;
  }

  lastHeartbeatTime = now;

  sendDeviceEvent(
    "DEVICE_HEARTBEAT",
    "ESP32 main controller is online"
  );
}

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);

  pinMode(PERSON_IR_PIN, INPUT);
  pinMode(GATE_TOP_IR_PIN, INPUT);

  pinMode(EXIT_BUTTON_PIN, INPUT_PULLUP);
  pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);

  digitalWrite(BUZZER_PIN, LOW);
  setIdleLed();

  gateServo.setPeriodHertz(50);
  gateServo.attach(SERVO_PIN, 500, 2400);
  gateServo.write(LOCK_ANGLE);
  gateUnlocked = false;

  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN, RFID_SS_PIN);
  rfid.PCD_Init();

  connectWiFi();

  sendDeviceEvent(
    "DEVICE_ONLINE",
    "ESP32 main controller started"
  );

  Serial.println("System ready.");
}

// =======================
// LOOP
// =======================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  handleRfid();
  handleIntrusion();
  handleExitButton();
  sendHeartbeat();

  delay(100);
}
```

---

## 8. Luồng hoạt động khi quẹt thẻ

```text
Người dùng quẹt thẻ
        ↓
ESP32 đọc UID từ RC522
        ↓
ESP32 gửi UID lên backend
        ↓
Backend kiểm tra UID
        ↓
Nếu hợp lệ:
    Servo quay 90 độ để mở khóa cổng
    LED xanh sáng
    Buzzer kêu 1 lần
    Ghi log ACCESS_GRANTED
        ↓
Sau 3 giây:
    Servo quay về 0 độ để khóa lại
    Ghi log GATE_LOCKED

Nếu không hợp lệ:
    LED đỏ sáng
    Buzzer kêu 3 lần
    Ghi log ACCESS_DENIED
```

---

## 9. Luồng phát hiện trèo / nhảy qua cổng

```text
Cảm biến vượt cổng bị che
        ↓
ESP32 kiểm tra cổng có đang mở hợp lệ không
        ↓
Nếu cổng không được mở hợp lệ:
    Buzzer báo động
    LED đỏ sáng
    Gửi event INTRUSION_DETECTED lên backend
        ↓
Web dashboard hiển thị cảnh báo
```

---

## 10. Việc cần sửa trước khi nạp code

Trong cả 2 file `.ino`, sửa 3 dòng này:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER_BASE_URL = "http://192.168.1.10:3000";
```

Ví dụ máy chạy backend có IP:

```text
192.168.1.10
```

thì để:

```cpp
const char* SERVER_BASE_URL = "http://192.168.1.10:3000";
```

Không dùng:

```text
localhost
```

vì với ESP32, `localhost` là chính ESP32, không phải máy tính của bạn.

---

## 11. Checklist triển khai

### Bước 1: Test ESP32 mạch chính

- [ ] Cắm RC522 theo đúng GPIO.
- [ ] Test đọc UID thẻ.
- [ ] Test servo quay 0 độ và 90 độ.
- [ ] Test LED xanh, LED đỏ, buzzer.
- [ ] Test cảm biến vượt cổng.
- [ ] Test gửi event lên backend.

### Bước 2: Test ESP32-CAM

- [ ] Upload code camera.
- [ ] Kiểm tra camera init thành công.
- [ ] Kiểm tra ảnh được gửi lên backend.
- [ ] Kiểm tra event `CAMERA_ONLINE`.
- [ ] Kiểm tra event `SNAPSHOT_UPLOADED`.

### Bước 3: Test backend

- [ ] API `/api/device/rfid/verify` trả đúng `allow`.
- [ ] API `/api/device/events` lưu log.
- [ ] API `/api/device/camera/snapshot` lưu ảnh.
- [ ] Dashboard hiển thị log.
- [ ] Dashboard hiển thị cảnh báo.

### Bước 4: Demo hoàn chỉnh

- [ ] Thẻ hợp lệ mở cổng.
- [ ] Thẻ sai bị từ chối.
- [ ] Cảm biến vượt cổng kích hoạt báo động.
- [ ] Web hiển thị log ra vào.
- [ ] Web hiển thị cảnh báo xâm nhập.
- [ ] ESP32-CAM gửi ảnh lên backend.

---

## 12. Kết luận triển khai

Với cấu trúc này, nhóm có thể demo được đầy đủ lõi hệ thống:

```text
ESP32-CAM:
    chụp ảnh + gửi event camera

ESP32 mạch chính:
    RFID + servo mở khóa + cảm biến + buzzer + LED

Backend:
    xác thực RFID + lưu log + hiển thị dashboard
```

Phần nhận diện AI thật nên để backend xử lý từ ảnh ESP32-CAM gửi lên. Không nên ép ESP32-CAM chạy nhận diện nặng, vì dễ thiếu RAM, chậm và khó debug.
