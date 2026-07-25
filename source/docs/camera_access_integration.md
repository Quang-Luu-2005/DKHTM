# Tích hợp ESP32-CAM với bộ điều khiển cổng

## 1. Phạm vi hợp nhất

Firmware trong `DKHTM-Van/DKHTM-Van/src/ESP32-Automatic-Gate` được dùng làm
nguồn tham chiếu cho RFID, servo, LED, còi, HC-SR04 và nút an toàn. Phần đã hợp
nhất nằm trong `source/hardware/main_controller`; thư mục import ban đầu không
tham gia build.

Các khối đã được tách:

| Module | Trách nhiệm |
| --- | --- |
| `gate_actuator.*` | Điều khiển servo, khóa/mở và tự khóa an toàn |
| `rfid_reader.*` | Đọc UID MFRC522 theo định dạng `AA:BB:CC:DD` |
| `ultrasonic_sensor.*` | Đo khoảng cách HC-SR04 |
| `status_indicators.*` | LED đỏ/xanh và còi cảnh báo |
| `safety_button.*` | Nút xóa cảnh báo tại chỗ |
| `backend_client.*` | Gửi event có xác thực tới backend |
| `main_controller.ino` | Điều phối module và cung cấp HTTP API nhận lệnh |

## 2. Luồng dữ liệu

```text
ESP32-CAM
  -> detect/recognize
  -> POST FACE_RECOGNIZED hoặc FACE_DENIED + confidence
  -> POST JPEG snapshot có cùng eventId
  -> Backend access policy
  -> tạo audit log + SSE cho dashboard
  -> queue SET_STATE
  -> Main controller HTTP API
  -> servo/LED/buzzer
  -> tự queue LOCK sau ACCESS_UNLOCK_DURATION_MS
```

RFID dùng cùng đường quyết định:

```text
MFRC522 -> RFID_SCANNED + rfidUid -> tìm User.rfidUid
  -> có người dùng: GRANT
  -> không có người dùng: DENY
```

Backend là điểm quyết định duy nhất. Camera không gọi thẳng controller và
controller không tự chấp nhận mọi thẻ, nhờ đó log dashboard, trạng thái lệnh và
trạng thái cửa không bị tách thành nhiều nguồn sự thật.

## 3. Hợp đồng event

Khuôn mặt hợp lệ:

```json
{
  "eventType": "FACE_RECOGNIZED",
  "recognized": true,
  "recognizedId": 3,
  "recognizedName": "Nguyen Van A",
  "confidence": 0.91,
  "gateId": "GATE_01"
}
```

Khuôn mặt lạ dùng `FACE_DENIED`; thẻ dùng `RFID_SCANNED` và trường `rfidUid`.
Backend trả thêm `accessDecision` và `commandId`. Event được chống trùng bằng
cặp `deviceId + eventId`; camera có cooldown để cùng một khuôn mặt không tạo
event liên tục.

## 4. GPIO main controller

| Thiết bị | GPIO |
| --- | --- |
| MFRC522 SS / RST | 5 / 16 |
| SPI SCK / MISO / MOSI | 18 / 19 / 23 |
| Servo | 26 |
| LED xanh / đỏ | 32 / 33 |
| HC-SR04 Trig / Echo | 12 / 13 |
| Buzzer | 21 |
| Nút an toàn | 17 |

Chân Echo của HC-SR04 phải qua cầu chia áp về 3.3 V. Servo nên dùng nguồn 5 V
riêng đủ dòng và nối chung GND với ESP32.

## 5. Cấu hình bắt buộc

1. Sửa Wi-Fi/backend trong:
   - `hardware/esp32cam_node/config.h`
   - `hardware/main_controller/config.h`
2. `kDeviceSecret` của hai firmware phải trùng `DEVICE_SECRET` backend.
3. `kGateId`/`kDoorId` phải trùng `DEFAULT_GATE_ID`.
4. Sau khi controller in IP, đặt:

```dotenv
CONTROLLER_URL=http://<IP-CONTROLLER>
ACCESS_UNLOCK_DURATION_MS=5000
DENIED_SIGNAL_DURATION_MS=1000
```

5. Frontend:

```dotenv
VITE_CAMERA_URL=http://<IP-ESP32-CAM>
```

## 6. Đăng ký người dùng

- Face ID: nhập họ tên, đặt mặt trước camera, nhấn **Đăng ký trực tiếp từ
  ESP32-CAM**, chờ camera trả thành công rồi lưu hồ sơ. Tên enroll trên camera
  chính là tên xuất hiện trong event và dashboard.
- RFID: nhấn **Quét thẻ** trên dashboard rồi đặt thẻ lên MFRC522. Dashboard chờ
  UID thật đi qua controller/backend/SSE trong tối đa 15 giây; không còn sinh UID
  giả.

## 7. Build và kiểm tra

```powershell
cd D:\DKHTM\source
pio run -e esp32cam_node
pio run -e esp32_main_controller

cd software\backend
npm ci
npx prisma generate
npm test

cd ..\frontend
npm ci
npm run build
```

Kiểm tra `/status` của camera phải có `faceRecognitionAvailable: true`. Khi đưa
mặt đã enroll vào khung hình, dashboard phải nhận log `Face ID`, cửa chuyển xanh
và mở, sau đó tự khóa. Với mặt lạ, log là `VIOLATION`, cửa giữ khóa và còi/LED đỏ
được kích hoạt trong thời gian cấu hình.
