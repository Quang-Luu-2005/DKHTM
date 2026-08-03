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
HC-SR04 (cửa đang khóa, distance <= kRecognitionDistanceCm)
  -> Main controller POST PRESENCE_DETECTED
  -> Backend mở presence-window cho gate
ESP32-CAM
  -> detect đúng một khuôn mặt
  -> FaceRecognition112V1S8 trích normalized embedding
  -> POST FACE_EMBEDDING { model, dimension, vector }
  -> Backend access policy
  -> so cosine với FaceProfile trong PostgreSQL và áp FACE_MATCH_THRESHOLD
  -> tạo audit log + SSE cho dashboard
  -> queue SET_STATE
  -> Main controller HTTP API
  -> servo/LED/buzzer
  -> tự queue LOCK sau ACCESS_UNLOCK_DURATION_MS
  -> camera chỉ upload snapshot khi backend trả GRANT hoặc DENY
```

RFID dùng cùng đường quyết định:

```text
MFRC522 -> RFID_SCANNED + rfidUid -> tìm User.rfidUid
  -> có người dùng: GRANT
  -> không có người dùng: DENY
  -> controller đọc accessDecision ngay trong response để mở/báo từ chối tại chỗ
```

PostgreSQL/backend là nguồn danh tính và điểm quyết định duy nhất. Camera không
load template cũ từ partition `fr`, không phát `FACE_RECOGNIZED` và không tự cấp
quyền từ flash. Controller chỉ mở thẻ sau khi backend đã xác nhận UID đăng ký.

## 3. Hợp đồng event

Event hiện diện:

```json
{
  "eventType": "PRESENCE_DETECTED",
  "distanceCm": 62,
  "recognitionDistanceCm": 80,
  "gateId": "GATE_01"
}
```

Camera gửi `FACE_EMBEDDING` theo `kRecognitionIntervalMs`. Payload bắt buộc có
`model`, `dimension` và mảng số thực `vector`; firmware chuẩn hóa L2 vector trước
khi gửi. Backend chỉ so khớp event nằm trong presence-window, trả
`accessDecision` (`GRANT`, `DENY` hoặc `null`) và `commandId`. Event được chống
trùng bằng cặp `deviceId + eventId`; vector không được lưu vào payload audit thô.

Thẻ dùng `RFID_SCANNED` và trường `rfidUid`. Event `FACE_RECOGNIZED` cũ không còn
được tin cậy để mở cửa.

## 4. GPIO main controller

Toàn bộ GPIO của main controller và AI Thinker ESP32-CAM được khai báo duy nhất
trong `hardware/pin_config.h`. Khi đổi cách đấu dây, chỉ sửa file này rồi build
và nạp lại firmware; không sửa số GPIO rải rác trong các module.

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
CAMERA_URL=http://<IP-ESP32-CAM>
ACCESS_UNLOCK_DURATION_MS=5000
DENIED_SIGNAL_DURATION_MS=1000
FACE_MATCH_THRESHOLD=0.55
FACE_PRESENCE_WINDOW_MS=5000
```

5. Frontend:

```dotenv
VITE_CAMERA_URL=http://<IP-ESP32-CAM>
```

Dashboard dùng luồng `/stream?detect=1`: model detection vẽ khung định kỳ, model
embedding chạy theo `kRecognitionIntervalMs`, và trạng thái
`faceDetectionAvailable`/`faceRecognitionAvailable` được đọc từ `/status`.

## 6. Đăng ký người dùng

- Face ID: người quản trị upload JPG/PNG trên dashboard. Backend chuẩn hóa ảnh
  thành JPEG QVGA `320x240`, gọi authenticated `POST /face/embedding` với raw
  `image/jpeg`, rồi lưu ảnh và embedding vào `FaceProfile` trong PostgreSQL.
  Endpoint yêu cầu đúng một khuôn mặt; ảnh sai kích thước, quá giới hạn, không có
  mặt hoặc có nhiều mặt đều bị từ chối. Endpoint `/face/enroll` cũ trả HTTP 410.
  ESP32-CAM dùng WebServer đồng bộ; nếu một trình duyệt khác đang giữ kết nối
  `/stream`, hãy đóng luồng đó trước khi upload để `/face/embedding` nhận request.
- RFID: nhấn **Quét thẻ** trên dashboard rồi đặt thẻ lên MFRC522. Dashboard chờ
  UID thật đi qua controller/backend/SSE trong tối đa 15 giây; không còn sinh UID
  giả.

## 7. Điều khiển trực tiếp từ dashboard

Cụm **Điều khiển trực tiếp mạch** gửi lệnh qua
`POST /api/hardware/command`:

- **Mở cửa**: servo mở, LED xanh; backend tự gửi lệnh khóa lại sau thời gian cấu
  hình.
- **Khóa cửa**: servo về góc khóa, LED đỏ.
- **Báo động**: giữ cửa khóa và bật còi.
- **Tắt cảnh báo**: tắt còi, giữ trạng thái cửa an toàn.

Backend gửi `x-device-secret` tới HTTP API của main controller; firmware từ chối
lệnh điều khiển không có secret trùng với `DEVICE_SECRET`.

## 8. Build và kiểm tra

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
