# Kế hoạch triển khai MVP hệ thống kiểm soát ra vào Sentinel

## 1. Mục tiêu

Hoàn thiện một MVP chạy xuyên suốt từ phần cứng đến phần mềm, có thể trình diễn và
đánh giá bằng dữ liệu thật:

```text
RFID / HC-SR04 / ESP32-CAM
  -> ESP32 Main Controller / ESP32-CAM
  -> Backend Node.js
  -> PostgreSQL
  -> SSE real-time
  -> Dashboard React
  -> lệnh mở/khóa cổng, LED và buzzer
```

MVP phải chứng minh được:

- Hai ESP32 kết nối Wi-Fi và gửi heartbeat về backend.
- Dashboard hiển thị camera trực tiếp và trạng thái online/offline.
- RFID hợp lệ mở cổng; RFID lạ bị từ chối.
- Khuôn mặt đã đăng ký mở cổng; khuôn mặt không khớp bị từ chối.
- Mọi quyết định truy cập được ghi vào PostgreSQL và xuất hiện trên dashboard gần
  như ngay lập tức qua SSE.
- Lệnh thủ công từ dashboard được controller xác nhận bằng trạng thái `ACKED`.
- Cổng tự khóa lại sau thời gian cho phép.
- Hệ thống không tự mở cổng nếu backend, camera hoặc mạng gặp lỗi.

## 2. Phạm vi MVP

### 2.1. Chức năng bắt buộc

- Camera MJPEG trực tiếp từ ESP32-CAM.
- Đăng ký người dùng, UID RFID và ảnh chân dung.
- Xác thực RFID qua backend/PostgreSQL.
- Phát hiện người bằng HC-SR04 để mở cửa sổ nhận diện khuôn mặt.
- Trích xuất face embedding trên ESP32-CAM và so khớp tại backend.
- Điều khiển servo, LED đỏ/xanh và buzzer.
- Nhật ký truy cập và snapshot cho quyết định Face ID.
- Trạng thái thiết bị online/offline.
- Điều khiển mở, khóa, báo động và tắt cảnh báo từ dashboard.
- Realtime bằng SSE; polling 10 giây chỉ đóng vai trò dự phòng.

### 2.2. Chưa cam kết trong MVP

Các mục sau chỉ được trình bày là hướng phát triển nếu chưa có nguồn dữ liệu phần
cứng thật:

- Phát hiện tailgating.
- Phát hiện trèo/nhảy qua cổng.
- Phân tích sự cố bằng LLM.
- Nhận diện trạng thái vật lý của cánh cửa khi chưa có công tắc hành trình hoặc
  cảm biến từ.
- Phân quyền đăng nhập dashboard ở mức production.

Không dùng dữ liệu giả để trình bày các mục trên như chức năng đã hoàn thiện.

## 3. Hiện trạng ban đầu

### 3.1. Phần đã có

- Firmware `main_controller` và `esp32cam_node` đã build thành công.
- Backend có REST API, SSE, Prisma/PostgreSQL, lưu snapshot, theo dõi heartbeat và
  hàng đợi hardware command.
- Frontend có dashboard, đăng ký người dùng, audit log, camera stream và bảng điều
  khiển phần cứng.
- Unit test backend hiện đạt 8 test; 2 integration test cần PostgreSQL đang bị
  skip khi database chưa chạy.
- Frontend vượt qua `tsc --noEmit`.

### 3.2. Phần chưa được nghiệm thu

- Chưa có file cấu hình runtime `.env` và `.env.local`.
- Chưa chạy PostgreSQL/backend/frontend đồng thời.
- Chưa kiểm thử hai board thật trên cùng mạng LAN.
- Chưa chạy integration test với database.
- Chưa đo độ ổn định của Face ID trong điều kiện ánh sáng thực tế.
- Chưa có cảm biến phản hồi cổng đóng/mở vật lý.

### 3.3. Trạng thái triển khai hiện tại

Các hạng mục phần mềm sau đã được triển khai và kiểm chứng trong repository:

- Backend integration test chạy tuần tự qua `npm run test:integration`, tránh hai
  test process tranh chấp biến môi trường và database.
- Luồng enrollment ảnh → ESP32-CAM `/face/embedding` → `FaceProfile.embedding` →
  cosine matching đã có integration test với PostgreSQL thật.
- Controller heartbeat có thể gửi `hardware` telemetry; backend cập nhật
  `reportedState`, `lastReportedAt`, `connectionStatus` và phát `hardware.state`
  qua SSE.
- Controller gửi event `SAFETY_BUTTON_PRESSED`; nút tại chỗ không còn chỉ thay đổi
  LED/buzzer cục bộ.
- Dashboard hiển thị trạng thái phản hồi từ controller và phân biệt đây là trạng
  thái điều khiển, không tuyên bố là trạng thái cánh cửa vật lý.
- Có script `scripts/mvp-preflight.ps1` để kiểm tra Docker, backend, camera model,
  controller telemetry, test phần mềm và build firmware.

Blocker còn lại không thể giả lập an toàn trong môi trường code:

- Chưa có `software/backend/.env` và `software/frontend/.env.local` với địa chỉ
  camera/controller thật.
- Chưa có hai board ESP32 kết nối để lấy IP, nạp firmware và đo hành vi cảm biến.
- Chưa có công tắc hành trình/reed switch, vì vậy chưa thể xác nhận cổng vật lý bị
  kẹt hay đã đóng thật.
- ESP32-CAM phải dùng build PlatformIO có ESP-DL model; Arduino core fallback chỉ
  chứng minh compile, không chứng minh Face ID hoạt động.

## 4. Điều kiện chuẩn bị

### 4.1. Thiết bị

- 01 ESP32 Dev Module.
- 01 AI Thinker ESP32-CAM có PSRAM.
- 01 bộ nạp USB-UART cho ESP32-CAM.
- 01 MFRC522 và ít nhất 02 thẻ RFID.
- 01 HC-SR04.
- 01 servo SG90.
- 02 LED và điện trở hạn dòng phù hợp.
- 01 buzzer.
- 01 nút nhấn.
- Nguồn 5 V riêng đủ dòng cho servo.
- Cầu chia áp cho chân Echo HC-SR04 từ 5 V xuống 3.3 V.
- Dây nối và breadboard.

### 4.2. Phần mềm

- Node.js 20 trở lên.
- Docker Desktop và Docker Compose v2.
- PlatformIO 6.x.
- Arduino IDE nếu dùng để nạp main controller.
- Trình duyệt Chrome hoặc Edge.

### 4.3. Quy tắc mạng

- Máy tính, ESP32 Dev Module và ESP32-CAM phải cùng một mạng LAN.
- Không dùng mạng Wi-Fi có client isolation.
- Backend phải dùng IPv4 LAN của máy tính, không dùng `localhost` trong firmware.
- Nên đặt DHCP reservation hoặc IP tĩnh cho máy tính và hai ESP32 để tránh đổi IP
  trước buổi demo.
- Windows Firewall phải cho phép TCP 3000 và 3001 trên mạng Private.

## 5. Sơ đồ chân và yêu cầu điện

| Thiết bị | GPIO main controller |
| --- | ---: |
| MFRC522 SS | 5 |
| MFRC522 RST | 16 |
| SPI SCK | 18 |
| SPI MISO | 19 |
| SPI MOSI | 23 |
| Servo | 26 |
| LED xanh | 32 |
| LED đỏ | 33 |
| Buzzer | 21 |
| Nút an toàn | 17 |
| HC-SR04 Trig | 12 |
| HC-SR04 Echo | 13 |

Yêu cầu bắt buộc:

- Echo HC-SR04 phải qua cầu chia áp về 3.3 V.
- Servo dùng nguồn 5 V riêng; không cấp từ chân 3.3 V của ESP32.
- Nối chung GND giữa ESP32, nguồn servo và các module.
- Kiểm tra nguồn và dây trước khi cắm USB.

## 6. Các giai đoạn triển khai

### Giai đoạn 0 — Chốt cấu hình và chuẩn bị môi trường

**Mục tiêu:** tạo một bộ cấu hình duy nhất cho toàn hệ thống.

#### Công việc

- [ ] Mở Docker Desktop và xác nhận Docker Engine đang chạy.
- [ ] Xác định IPv4 LAN của máy tính bằng `ipconfig`.
- [ ] Chọn `DEVICE_SECRET` có ít nhất 16 ký tự cho bản demo.
- [ ] Chọn tên Wi-Fi và mật khẩu dùng trong buổi trình diễn.
- [ ] Sao chép file môi trường:

```powershell
cd D:\DKHTM\source
Copy-Item software/backend/.env.example software/backend/.env
Copy-Item software/frontend/.env.example software/frontend/.env.local
```

- [ ] Sửa `hardware/main_controller/config.h`:

```cpp
constexpr char kWifiSsid[] = "<WIFI_SSID>";
constexpr char kWifiPass[] = "<WIFI_PASSWORD>";
constexpr char kBackendBaseUrl[] = "http://<IP_MAY_TINH>:3001";
constexpr char kDeviceSecret[] = "<DEVICE_SECRET>";
```

- [ ] Sửa `hardware/esp32cam_node/config.h` tương ứng:

```cpp
constexpr char kWifiSsid[] = "<WIFI_SSID>";
constexpr char kWifiPass[] = "<WIFI_PASSWORD>";
constexpr char kServerBaseUrl[] = "http://<IP_MAY_TINH>:3001";
constexpr char kDeviceSecret[] = "<DEVICE_SECRET>";
```

- [ ] Sửa `software/backend/.env`:

```dotenv
DATABASE_URL=postgresql://sentinel:sentinel@localhost:5432/sentinel?schema=public
DEVICE_SECRET=<DEVICE_SECRET>
CAMERA_URL=
CONTROLLER_URL=
CONTROLLER_DEVICE_ID=MAIN_CONTROLLER_001
DEFAULT_GATE_ID=GATE_01
FACE_MATCH_THRESHOLD=0.55
FACE_PRESENCE_WINDOW_MS=5000
DEVICE_OFFLINE_AFTER_MS=45000
```

#### Tiêu chí hoàn thành

- Các firmware và backend dùng cùng `DEVICE_SECRET`.
- Cả hai firmware trỏ đúng IPv4 LAN của máy tính.
- Không còn IP cũ trong các file cấu hình đang dùng.

---

### Giai đoạn 1 — Khởi động database và backend

**Mục tiêu:** backend kết nối PostgreSQL và sẵn sàng nhận event.

#### Công việc

- [ ] Chạy PostgreSQL và backend:

```powershell
cd D:\DKHTM\source
docker compose --env-file software/backend/.env up -d --build
docker compose ps
docker compose logs --tail=100 backend
```

- [ ] Kiểm tra health endpoint:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

- [ ] Kiểm tra migration:

```powershell
cd D:\DKHTM\source\software\backend
npx prisma migrate status
```

- [ ] Chạy test logic:

```powershell
npm test
```

- [ ] Chạy integration test với PostgreSQL:

```powershell
$env:RUN_INTEGRATION='1'
node --test --test-concurrency=1 test/api.integration.test.js
node --test --test-concurrency=1 test/face-flow.test.js
Remove-Item Env:RUN_INTEGRATION
```

#### Tiêu chí hoàn thành

- `/api/health` trả `ok: true` và `database: connected`.
- Container `postgres` và `backend` ở trạng thái running/healthy.
- Toàn bộ unit test và integration test đạt.
- Không có Prisma error hoặc vòng lặp restart container.

---

### Giai đoạn 2 — Bring-up main controller

**Mục tiêu:** xác nhận riêng từng linh kiện trước khi kết nối toàn hệ thống.

#### Công việc

- [ ] Đấu MFRC522, servo, LED, buzzer, nút nhấn và HC-SR04 theo bảng chân.
- [ ] Tháo cơ cấu tải khỏi servo trong lần thử đầu để tránh kẹt cơ khí.
- [ ] Build firmware:

```powershell
cd D:\DKHTM\source
pio run -e esp32_main_controller
```

- [ ] Nạp firmware và mở Serial Monitor:

```powershell
pio run -e esp32_main_controller -t upload --upload-port <COM_CONTROLLER>
pio device monitor --port <COM_CONTROLLER> -b 115200
```

- [ ] Ghi lại IP controller được in trên Serial Monitor.
- [ ] Kiểm tra status trực tiếp:

```powershell
Invoke-RestMethod http://<IP_CONTROLLER>/api/hardware/status
```

- [ ] Kiểm tra từng phần:
  - Servo về góc khóa khi khởi động.
  - LED đỏ sáng ở trạng thái mặc định.
  - Quét RFID thấy UID thật trên Serial Monitor.
  - HC-SR04 trả presence event khi vật ở trong phạm vi.
  - Buzzer hoạt động khi nhận lệnh từ chối.
  - Nút nhấn tắt cảnh báo tại chỗ.

- [ ] Điền vào `software/backend/.env`:

```dotenv
CONTROLLER_URL=http://<IP_CONTROLLER>
```

- [ ] Khởi động lại backend:

```powershell
cd D:\DKHTM\source
docker compose --env-file software/backend/.env up -d --build backend
```

#### Tiêu chí hoàn thành

- Controller kết nối Wi-Fi ổn định.
- Backend nhận `CONTROLLER_ONLINE` và heartbeat mỗi 30 giây.
- Lệnh dashboard/backend nhận ACK có đúng `commandId`.
- Servo, LED và buzzer phản ứng đúng với `LOCK`, `GRANT`, `DENY`, `IDLE`.

---

### Giai đoạn 3 — Bring-up ESP32-CAM và face engine

**Mục tiêu:** camera hoạt động và face model thật sự khả dụng.

#### Công việc

- [ ] Build ESP32-CAM bằng PlatformIO:

```powershell
cd D:\DKHTM\source
pio run -e esp32cam_node
```

> Không dùng kết quả “compile thành công” của Arduino-ESP32 core 3.x làm bằng chứng
> Face ID hoạt động. Core đó có thể build firmware fallback nhưng thiếu ESP-DL model.

- [ ] Nạp firmware:

```powershell
pio run -e esp32cam_node -t upload --upload-port <COM_CAMERA>
pio device monitor --port <COM_CAMERA> -b 115200
```

- [ ] Ghi lại IP camera.
- [ ] Kiểm tra status:

```powershell
Invoke-RestMethod http://<IP_CAMERA>/status
```

- [ ] Bắt buộc xác nhận:

```json
{
  "cameraReady": true,
  "faceDetectionAvailable": true,
  "faceRecognitionAvailable": true
}
```

- [ ] Kiểm tra ảnh tĩnh bằng trình duyệt:

```text
http://<IP_CAMERA>/capture
```

- [ ] Kiểm tra stream:

```text
http://<IP_CAMERA>/stream?detect=1&detectEvery=15&quality=72&delay=10
```

- [ ] Điền vào `software/backend/.env`:

```dotenv
CAMERA_URL=http://<IP_CAMERA>
```

- [ ] Điền vào `software/frontend/.env.local`:

```dotenv
VITE_API_URL=
VITE_CAMERA_URL=http://<IP_CAMERA>
```

- [ ] Restart backend sau khi đổi `CAMERA_URL`.

#### Tiêu chí hoàn thành

- Camera stream liên tục ít nhất 10 phút, không reboot.
- `/status` xác nhận cả detection và recognition đều khả dụng.
- Backend nhận `CAMERA_ONLINE` và heartbeat mỗi 30 giây.
- Stream hiển thị khung nhận diện mà không làm camera mất kết nối.

---

### Giai đoạn 4 — Khởi động dashboard và xác minh real-time

**Mục tiêu:** dữ liệu ban đầu đến từ REST và cập nhật mới đến từ SSE.

#### Công việc

- [ ] Chạy frontend:

```powershell
cd D:\DKHTM\source\software\frontend
npm install
npm run lint
npm run dev
```

- [ ] Mở `http://localhost:3000`.
- [ ] Mở DevTools → Network và xác nhận `/api/events` giữ kết nối.
- [ ] Xác nhận dashboard hiển thị camera thật, không phải placeholder.
- [ ] Xác nhận controller và camera hiển thị online.
- [ ] Gửi một manual audit log hoặc quét thẻ và kiểm tra log xuất hiện không cần
  tải lại trang.
- [ ] Ngắt SSE tạm thời và xác nhận polling đồng bộ lại trong tối đa 10 giây.

#### Tiêu chí hoàn thành

- SSE kết nối ổn định và có keep-alive.
- Audit log mới xuất hiện gần như ngay lập tức.
- Hardware state thay đổi sau ACK, không chỉ thay đổi giao diện cục bộ.
- Camera báo rõ model khả dụng hoặc lỗi thật; không dùng ảnh minh họa giả.

---

### Giai đoạn 5 — Nghiệm thu RFID end-to-end

**Mục tiêu:** chứng minh backend/PostgreSQL là nguồn quyết định duy nhất.

#### Kịch bản A — RFID hợp lệ

- [ ] Tạo người dùng trên dashboard.
- [ ] Gắn UID thật của thẻ vào người dùng.
- [ ] Đưa thẻ lên MFRC522.
- [ ] Xác nhận controller gửi `RFID_SCANNED`.
- [ ] Xác nhận backend tìm thấy người dùng và trả `GRANT`.
- [ ] Xác nhận servo mở và LED xanh.
- [ ] Xác nhận audit log có tên người dùng, UID/mã người dùng và `RFID`.
- [ ] Xác nhận cổng tự khóa lại sau 5 giây.

#### Kịch bản B — RFID không hợp lệ

- [ ] Dùng thẻ chưa đăng ký.
- [ ] Xác nhận backend trả `DENY`.
- [ ] Xác nhận servo không mở.
- [ ] Xác nhận LED đỏ và buzzer hoạt động.
- [ ] Xác nhận dashboard nhận log `VIOLATION` qua SSE.

#### Kịch bản C — Backend mất kết nối

- [ ] Dừng backend.
- [ ] Quét thẻ hợp lệ.
- [ ] Xác nhận controller không tự mở cổng khi không nhận được quyết định.
- [ ] Khởi động backend và xác nhận heartbeat phục hồi trạng thái online.

#### Tiêu chí hoàn thành

- Cả ba kịch bản đạt 5 lần liên tiếp.
- Không mở cổng do UID được hard-code hoặc cache cục bộ.

---

### Giai đoạn 6 — Nghiệm thu Face ID end-to-end

**Mục tiêu:** đăng ký và nhận diện dùng cùng một model embedding.

#### Chuẩn bị

- [ ] Đảm bảo dashboard camera stream đã đóng khi upload ảnh đăng ký nếu camera
  không phục vụ đồng thời được hai request.
- [ ] Dùng ảnh rõ, chính diện, chỉ có một khuôn mặt.
- [ ] Đảm bảo ánh sáng không ngược sáng.

#### Kịch bản A — Đăng ký khuôn mặt

- [ ] Tạo hoặc chỉnh sửa người dùng.
- [ ] Upload ảnh chân dung.
- [ ] Backend chuẩn hóa ảnh 320×240 và gọi `/face/embedding` trên camera.
- [ ] Xác nhận người dùng chuyển sang `ENROLLED`.
- [ ] Xác nhận có `FaceProfile` và ảnh portrait trong storage.

#### Kịch bản B — Khuôn mặt hợp lệ

- [ ] Đứng trong khoảng cách nhỏ hơn `kRecognitionDistanceCm`.
- [ ] Xác nhận HC-SR04 phát `PRESENCE_DETECTED`.
- [ ] Trong 5 giây, camera gửi `FACE_EMBEDDING`.
- [ ] Backend so cosine similarity và trả `GRANT`.
- [ ] Servo mở, LED xanh, audit log và snapshot xuất hiện.
- [ ] Cổng tự khóa sau thời gian quy định.

#### Kịch bản C — Khuôn mặt không khớp

- [ ] Dùng người chưa đăng ký.
- [ ] Xác nhận backend trả `DENY` khi có một khuôn mặt rõ nhưng dưới threshold.
- [ ] Xác nhận servo không mở, còi/LED cảnh báo và có snapshot.

#### Kịch bản D — Ngoài presence window

- [ ] Để camera thấy mặt nhưng không kích hoạt HC-SR04 cho gate tương ứng.
- [ ] Xác nhận embedding bị bỏ qua và cổng không mở.

#### Kịch bản E — Ảnh có nhiều khuôn mặt

- [ ] Đưa hai khuôn mặt vào khung hình.
- [ ] Xác nhận firmware không phát embedding dùng để cấp quyền.

#### Hiệu chỉnh threshold

Ghi lại ít nhất 20 mẫu gồm đúng người và sai người. Chỉ giảm
`FACE_MATCH_THRESHOLD` nếu false reject quá cao và vẫn giữ khoảng cách rõ ràng với
các mẫu sai người. Mỗi lần đổi threshold phải ghi vào biên bản test.

#### Tiêu chí hoàn thành

- Đúng người đạt ít nhất 8/10 lần trong điều kiện demo.
- Sai người không được mở cổng trong 10/10 lần.
- Không mở cổng khi không có presence window.
- Snapshot và audit log liên kết đúng quyết định.

---

### Giai đoạn 7 — Kiểm tra trạng thái và lỗi hệ thống

**Mục tiêu:** MVP có hành vi an toàn, dễ giải thích khi thành phần bị lỗi.

#### Ma trận kiểm thử

| Tình huống | Kết quả mong đợi |
| --- | --- |
| Camera mất nguồn | Camera `OFFLINE` sau khoảng 45 giây; RFID vẫn hoạt động |
| Controller mất nguồn | Controller `OFFLINE`; lệnh chuyển `TIMEOUT`/`FAILED` |
| Backend dừng | Hai board không được tự cấp quyền mới |
| PostgreSQL dừng | Health endpoint lỗi; không tạo quyết định không lưu được |
| Wi-Fi mất | Cổng giữ trạng thái an toàn; board thử kết nối lại |
| Controller trả sai `commandId` | Backend không ACK lệnh |
| Thẻ lạ | DENY, không mở servo |
| Face model unavailable | Dashboard báo model chưa sẵn sàng; Face ID không mở cổng |
| Servo kẹt | Hiện chưa phát hiện vật lý; ghi rõ là giới hạn MVP |

#### Tiêu chí hoàn thành

- Không có lỗi nào làm cổng tự mở ngoài quyết định hợp lệ.
- Dashboard phân biệt `ONLINE`, `OFFLINE`, `UNKNOWN`, `ACKED`, `FAILED`, `TIMEOUT`.
- Log backend và Serial Monitor đủ thông tin để chẩn đoán.

---

### Giai đoạn 8 — Bổ sung phản hồi trạng thái vật lý

**Ưu tiên:** cao nếu mục tiêu môn học yêu cầu “nắm bắt tình trạng thực tế”.

Hiện `reportedState` là trạng thái controller xác nhận sau lệnh, chưa chứng minh cánh
cửa vật lý đã đóng hoặc mở. Có hai phương án:

#### Phương án A — MVP không thêm linh kiện

- [ ] Đổi nhãn dashboard thành “Trạng thái điều khiển” hoặc “Commanded state”.
- [ ] Ghi rõ trong báo cáo rằng hệ thống chưa có closed-loop feedback.
- [ ] Không tuyên bố phát hiện servo/cửa bị kẹt.

#### Phương án B — Thêm cảm biến, được khuyến nghị

- [ ] Gắn reed switch hoặc limit switch tại vị trí đóng.
- [ ] Chọn GPIO còn trống và cập nhật `pin_config.h`.
- [ ] Controller gửi event khi trạng thái đổi:

```text
GATE_OPENED
GATE_CLOSED
GATE_STUCK
```

- [ ] Heartbeat controller kèm trạng thái cảm biến.
- [ ] Backend cập nhật `reportedState` từ cảm biến thay vì chỉ từ ACK.
- [ ] Dashboard hiển thị riêng:
  - Trạng thái mong muốn.
  - Trạng thái servo/controller.
  - Trạng thái cửa vật lý.

#### Tiêu chí hoàn thành phương án B

- Dashboard đổi trạng thái khi tác động trực tiếp lên cảm biến cửa.
- Nếu lệnh mở/đóng nhưng cảm biến không đổi trong timeout, sinh `GATE_STUCK`.

---

### Giai đoạn 9 — Ổn định trước buổi demo

#### Công việc

- [ ] Cố định IP hoặc DHCP reservation.
- [ ] Không commit Wi-Fi password hoặc secret thật vào repository công khai.
- [ ] Dán nhãn dây và hai cổng USB/COM.
- [ ] Đánh dấu vị trí đứng tối ưu cho Face ID.
- [ ] Test liên tục ít nhất 30 phút.
- [ ] Chạy 20 lượt RFID và 20 lượt Face ID.
- [ ] Reboot toàn bộ hệ thống và xác nhận tự phục hồi.
- [ ] Chuẩn bị một thẻ hợp lệ và một thẻ không hợp lệ.
- [ ] Chuẩn bị một người đã enroll và một người chưa enroll.
- [ ] Xuất hoặc chụp màn hình audit log dự phòng.
- [ ] Chuẩn bị video demo dự phòng trong trường hợp mạng phòng học không ổn định.

#### Tiêu chí hoàn thành

- Không có reboot ngoài ý muốn trong 30 phút.
- Không có false grant.
- Ít nhất 90% kịch bản hợp lệ hoạt động đúng trong điều kiện demo.
- Có thể khởi động hệ thống từ trạng thái tắt hoàn toàn theo checklist dưới 10 phút.

## 7. Kịch bản trình diễn đề xuất

Thời lượng mục tiêu: 5–7 phút.

1. Mở dashboard và giới thiệu trạng thái camera/controller online.
2. Cho xem camera stream trực tiếp.
3. Quét thẻ RFID hợp lệ; servo mở, LED xanh, log xuất hiện real-time và tự khóa.
4. Quét thẻ lạ; buzzer/LED đỏ và log vi phạm xuất hiện.
5. Đứng trước HC-SR04/camera bằng khuôn mặt đã enroll; hệ thống mở cổng và lưu
   snapshot.
6. Dùng khuôn mặt chưa enroll; hệ thống từ chối.
7. Nhấn lệnh khóa/mở hoặc báo động từ dashboard và chỉ ra `ACKED`.
8. Rút nguồn camera hoặc controller nếu còn thời gian để minh họa trạng thái offline.
9. Kết luận giới hạn MVP và hướng thêm cảm biến phản hồi cửa/tailgating.

## 8. Definition of Done

MVP chỉ được xem là hoàn thành khi tất cả mục sau đạt:

- [ ] Hai firmware build và nạp được từ một bản commit xác định.
- [ ] Backend, PostgreSQL và frontend khởi động theo README không cần sửa code.
- [ ] `/api/health` báo database connected và có URL camera/controller.
- [ ] Camera status báo `faceRecognitionAvailable: true`.
- [ ] Heartbeat của hai thiết bị cập nhật online/offline đúng.
- [ ] RFID hợp lệ và không hợp lệ đều qua luồng backend thật.
- [ ] Face ID hợp lệ và không hợp lệ đều qua embedding/backend thật.
- [ ] Servo tự khóa lại sau khi được cấp quyền.
- [ ] Audit log được lưu sau khi refresh/restart frontend.
- [ ] Dashboard nhận log và hardware state qua SSE.
- [ ] Lệnh phần cứng có `ACKED`, `FAILED` hoặc `TIMEOUT`, không treo vô hạn.
- [ ] Unit test, integration test và frontend typecheck đều đạt.
- [ ] Có biên bản test phần cứng và video demo dự phòng.
- [ ] Báo cáo không mô tả tailgating, gate jumping hoặc trạng thái cửa vật lý là
  chức năng hoàn thiện nếu chưa có dữ liệu cảm biến thật.

## 9. Lịch triển khai gợi ý 6 ngày

| Ngày | Mục tiêu | Kết quả cuối ngày |
| --- | --- | --- |
| 1 | Môi trường, Docker, database, backend | Health và integration test đạt |
| 2 | Main controller và từng linh kiện | RFID/servo/LED/buzzer/HC-SR04 chạy riêng |
| 3 | ESP32-CAM và model | Stream ổn định, recognition available |
| 4 | RFID + dashboard + SSE end-to-end | Ba kịch bản RFID đạt |
| 5 | Enrollment + Face ID end-to-end | Face hợp lệ/lạ/presence window đạt |
| 6 | Fault test, ổn định và tập demo | Checklist DoD, video và biên bản test |

Nếu thêm reed switch/limit switch, thực hiện sau khi RFID và Face ID cơ bản đã ổn
định; không để phần mở rộng làm hỏng luồng demo chính.

## 10. Biểu mẫu ghi kết quả test

| ID | Thời gian | Kịch bản | Input | Kết quả mong đợi | Kết quả thực tế | Log ID | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RFID-01 | | Thẻ hợp lệ | UID | GRANT + mở 5 s | | | |
| RFID-02 | | Thẻ lạ | UID | DENY + buzzer | | | |
| FACE-01 | | Mặt đã enroll | User ID | GRANT + snapshot | | | |
| FACE-02 | | Mặt lạ | N/A | DENY + snapshot | | | |
| FACE-03 | | Ngoài presence window | User ID | Không quyết định | | | |
| HW-01 | | Mở từ dashboard | GRANT | ACKED + tự khóa | | | |
| OFF-01 | | Rút camera | Mất heartbeat | OFFLINE ≤ 45 s | | | |
| OFF-02 | | Rút controller | Gửi command | TIMEOUT/FAILED | | | |

## 11. Lệnh kiểm tra nhanh trước demo

```powershell
cd D:\DKHTM\source
docker compose --env-file software/backend/.env ps
Invoke-RestMethod http://localhost:3001/api/health
Invoke-RestMethod http://<IP_CONTROLLER>/api/hardware/status
Invoke-RestMethod http://<IP_CAMERA>/status
```

Kiểm tra frontend:

```powershell
cd D:\DKHTM\source\software\frontend
npm run lint
```

Kiểm tra firmware:

```powershell
cd D:\DKHTM\source
pio run -e esp32_main_controller -e esp32cam_node
```

Nếu một trong bốn kiểm tra health/controller/camera/SSE không đạt, không bắt đầu
demo xác thực; xử lý tầng thấp hơn trước rồi mới tiếp tục luồng end-to-end.

Script kiểm tra tự động:

```powershell
cd D:\DKHTM\source
.\scripts\mvp-preflight.ps1 -RunSoftwareTests -BuildFirmware
```

Khi đã có IP camera và controller:

```powershell
.\scripts\mvp-preflight.ps1 `
  -CameraUrl http://<IP_CAMERA> `
  -ControllerUrl http://<IP_CONTROLLER> `
  -RunSoftwareTests `
  -BuildFirmware
```

Preflight phải có 0 lỗi trước khi chạy demo. Cảnh báo thiếu camera/controller chỉ
được chấp nhận khi đang làm software-only; không được xem là MVP end-to-end đạt.
