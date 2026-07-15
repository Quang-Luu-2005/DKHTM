# Hướng dẫn lắp mạch bản demo tối giản

> Repo hiện có 2 phần chính:
>
> - [../src/hardware/](../src/hardware/) — code Arduino/ESP32.
> - Web tĩnh ở root repo: [../../index.html](../../index.html), [../../app.js](../../app.js), [../../styles.css](../../styles.css).
>
> Firmware chính:
>
> - [../src/hardware/main_controller/main_controller.ino](../src/hardware/main_controller/main_controller.ino)
> - [../src/hardware/esp32cam_node/esp32cam_node.ino](../src/hardware/esp32cam_node/esp32cam_node.ino)

---

## 1. Mục tiêu lắp mạch

Hệ thống hiện chia làm **2 node độc lập**:

1. **ESP32 mạch chính**
   - Điều khiển servo mở/khóa cổng.
   - Bật LED đúng khi nhận lệnh cho phép.
   - Bật LED sai khi nhận lệnh từ chối.
   - Nhận lệnh test qua Serial Monitor.

2. **ESP32-CAM**
   - Chụp ảnh khu vực cổng.
   - Mở web server để xem live stream và snapshot.
   - Phát hiện khuôn mặt trên stream/snapshot để vẽ box.
   - Nhận diện khuôn mặt theo chế độ snapshot/manual.
   - Cho phép đăng ký danh tính từ web và lưu vào flash partition `fr`.
   - Có thể upload ảnh/event lên backend nếu bật cấu hình upload.

### Điểm quan trọng

- ESP32 main và ESP32-CAM **không cần nối GPIO trực tiếp với nhau**.
- Hai board chạy độc lập.
- ESP32 main lo phần cứng cửa/đèn.
- ESP32-CAM lo camera, face detection/recognition và web preview.
- Máy mở web preview và ESP32-CAM phải cùng mạng Wi‑Fi.
- ESP32-CAM cần **PSRAM** để chạy face detection ổn định.

---

## 2. Danh sách phần cứng cần chuẩn bị

### 2.1. Mạch chính

- 1 x ESP32 DevKit 38 pin / ESP32 Dev Module
- 1 x Servo SG90 hoặc MG90S
- 1 x LED báo đúng
- 1 x LED báo sai
- 2 x điện trở 220–330Ω cho 2 LED
- Breadboard, dây jumper
- Nguồn 5V ổn định cho servo

### 2.2. Node camera

- 1 x AI Thinker ESP32-CAM có PSRAM
- 1 x USB-TTL để nạp code
- Nguồn 5V ổn định

---

## 3. Mapping chân ESP32 mạch chính

| Linh kiện | Nối vào ESP32 | Ghi chú |
|---|---:|---|
| LED đúng | GPIO 21 | Anode qua điện trở, cathode về GND |
| LED sai | GPIO 19 | Anode qua điện trở, cathode về GND |
| Servo signal | GPIO 22 | Dây tín hiệu PWM |
| Servo VCC | Nguồn 5V riêng | Không cấp từ chân 3.3V |
| Servo GND | GND chung | Nối chung GND nguồn servo và GND ESP32 |

Logic LED trong firmware:

- GPIO `HIGH` -> LED sáng
- GPIO `LOW` -> LED tắt

Servo mặc định:

- Khóa: `0°`
- Mở: `90°`
- Thời gian mở demo: `3 giây`

---

## 4. Sơ đồ khối phần cứng

```text
ESP32 main controller
├── LED đúng  -> GPIO21
├── LED sai   -> GPIO19
└── Servo     -> GPIO22

ESP32-CAM
└── Camera + face detection/recognition + web preview qua Wi‑Fi
```

---

## 5. Nối dây chi tiết

### 5.1. LED đúng và LED sai

```text
ESP32 GPIO21 -> điện trở -> anode LED đúng
cathode LED đúng -> GND

ESP32 GPIO19 -> điện trở -> anode LED sai
cathode LED sai -> GND
```

### 5.2. Servo mở khóa cổng

```text
Servo signal -> ESP32 GPIO22
Servo VCC    -> nguồn 5V riêng
Servo GND    -> GND nguồn 5V và GND ESP32 nối chung
```

Lưu ý:

- Không lấy 5V servo từ chân 3.3V của ESP32.
- Nếu servo rung hoặc ESP32 reset, thường là do nguồn yếu hoặc chưa nối mass chung.

---

## 6. ESP32-CAM

### Nối tối thiểu để nạp code

```text
USB-TTL 5V  -> ESP32-CAM 5V
USB-TTL GND -> ESP32-CAM GND
USB-TTL TX  -> ESP32-CAM U0R
USB-TTL RX  -> ESP32-CAM U0T
IO0         -> GND khi vào chế độ flash
```

Sau khi nạp xong:

- tháo `IO0` khỏi GND
- reset board
- cấp nguồn 5V ổn định để camera chạy
- mở Serial Monitor `115200` để lấy IP

> Ghi chú: firmware face dùng partition `fr` để lưu danh tính; khi đổi partition layout, dữ liệu face đã lưu trước đó có thể bị mất sau khi nạp lại.

---

## 7. File firmware và web hiện dùng

| Phần | File |
|---|---|
| ESP32 main | [../src/hardware/main_controller/main_controller.ino](../src/hardware/main_controller/main_controller.ino) |
| ESP32-CAM entry point | [../src/hardware/esp32cam_node/esp32cam_node.ino](../src/hardware/esp32cam_node/esp32cam_node.ino) |
| ESP32-CAM config | [../src/hardware/esp32cam_node/config.h](../src/hardware/esp32cam_node/config.h) |
| ESP32-CAM face engine | [../src/hardware/esp32cam_node/face_engine.h](../src/hardware/esp32cam_node/face_engine.h) |
| Web preview | [../../index.html](../../index.html) |
| Cấu hình partition face | [../partitions_esp32cam_face.csv](../partitions_esp32cam_face.csv) |
| Build wrapper | [../src/hardware/platformio_esp32cam_node.cpp](../src/hardware/platformio_esp32cam_node.cpp) |
| Build config | [../platformio.ini](../platformio.ini) |
| Build notes | wrapper PlatformIO include sketch `.ino`; module `.h` được sketch include trực tiếp |
| Module layout | `esp32cam_node/` là layout phẳng: file `.ino` và toàn bộ module `.h` nằm chung một thư mục |

### 7.1. Nạp ESP32 main

1. Mở [../src/hardware/main_controller/main_controller.ino](../src/hardware/main_controller/main_controller.ino).
2. Cài thư viện `ESP32Servo`.
3. Chọn board `ESP32 Dev Module`.
4. Nạp code.
5. Mở Serial Monitor `115200`, chọn line ending `Newline`.
6. Gửi lệnh test:

| Lệnh | Tác dụng |
|---|---|
| `grant`, `1`, `d` | Bật LED đúng, mở servo 3 giây rồi khóa lại |
| `deny`, `0`, `s` | Bật LED sai trong thời gian ngắn |
| `lock` | Đưa servo về góc khóa |
| `idle` | Tắt cả 2 LED |
| `help` | In hướng dẫn |

### 7.2. Nạp ESP32-CAM

1. Mở [../src/hardware/esp32cam_node/esp32cam_node.ino](../src/hardware/esp32cam_node/esp32cam_node.ino).
2. Sửa cấu hình Wi‑Fi/backend trong [../src/hardware/esp32cam_node/config.h](../src/hardware/esp32cam_node/config.h):
   - `kWifiSsid`
   - `kWifiPass`
   - `kServerBaseUrl` nếu bật upload backend
   - `kDeviceSecret` nếu bật upload backend
3. Đảm bảo PlatformIO/board dùng partition [../partitions_esp32cam_face.csv](../partitions_esp32cam_face.csv).
4. Chọn board `AI Thinker ESP32-CAM`.
5. Nối `IO0` xuống GND khi nạp.
6. Nạp code, tháo `IO0` khỏi GND và reset.
7. Mở Serial Monitor `115200` để xem IP.

### 7.3. Xem camera bằng web preview

1. Mở [../../index.html](../../index.html) bằng trình duyệt.
2. Nhập địa chỉ ESP32-CAM dạng `http://192.168.x.x`.
3. Bấm **Check Status** để kiểm tra `/status`.
4. Bấm **Stream + Detect** để xem `/stream?detect=1&detectEvery=5&quality=60&delay=0`; bấm lại để tắt stream.
5. Nếu face engine không khả dụng, giao diện tự fallback sang `/stream` thường.
6. Bấm **Take Snapshot + Box** để chụp `/capture?detect=1`; bấm lại để ẩn snapshot.
7. Bấm **Recognize Snapshot** để nhận diện `/capture?detect=1&recognize=1`; bấm lại để ẩn snapshot recognition.
9. Nhập tên và bấm **Đăng ký khuôn mặt** để gọi `/face/enroll?name=...`.
10. Bấm **Refresh IDs** để tải danh sách `/face/ids`.

Các endpoint ESP32-CAM cung cấp:

| Endpoint | Tác dụng |
|---|---|
| `/status` | Trả trạng thái Wi‑Fi/camera/PSRAM/face engine |
| `/capture` | Chụp và trả về một ảnh JPEG |
| `/capture?detect=1` | Chụp ảnh có box khuôn mặt |
| `/capture?detect=1&recognize=1` | Chụp ảnh có box và label recognition |
| `/stream` | Live stream MJPEG thường; giao diện dùng làm fallback nếu face engine không khả dụng |
| `/stream?detect=1&detectEvery=5&quality=60&delay=0` | Live stream có box, detect mỗi 5 frame để cân bằng tốc độ |
| `/face/enroll?name=...` | Đăng ký 1 khuôn mặt từ frame hiện tại |
| `/face/ids` | Danh sách danh tính đã lưu |
| `/face/last-result` | Metadata nhận diện gần nhất |
| `/face/delete?id=...` | Xóa một danh tính |

---

## 8. Trình tự test sau khi lắp

### Bước 1: Test nguồn

- [ ] ESP32 main lên nguồn ổn định
- [ ] ESP32-CAM lên nguồn ổn định
- [ ] Servo có nguồn 5V riêng và GND chung với ESP32

### Bước 2: Test LED

- [ ] Gửi `grant`, LED đúng sáng
- [ ] Gửi `deny`, LED sai sáng
- [ ] Gửi `idle`, cả 2 LED tắt

### Bước 3: Test servo

- [ ] Gửi `grant`, servo quay sang góc mở
- [ ] Sau khoảng 3 giây, servo tự quay về góc khóa
- [ ] Khi servo quay, ESP32 không bị reset

### Bước 4: Test ESP32-CAM cơ bản

- [ ] Serial báo `Camera initialized.`
- [ ] Serial báo IP ESP32-CAM
- [ ] Web preview gọi được `/status`
- [ ] Web preview xem được `/capture`
- [ ] Web preview xem được `/stream`

### Bước 5: Test face detection / recognition

- [ ] `/status` báo `psramFound=true`
- [ ] Stream có box khi có mặt trong khung hình
- [ ] Snapshot detect có box khuôn mặt
- [ ] Enroll đúng 1 mặt với tên nhập từ web
- [ ] `/face/ids` hiển thị danh tính vừa lưu
- [ ] Recognize Snapshot trả về tên/similarity khi chụp lại cùng người
- [ ] Reset board xong danh tính vẫn còn trong flash partition `fr`

---

## 9. File dùng để debug

- Firmware ESP32 main: [../src/hardware/main_controller/main_controller.ino](../src/hardware/main_controller/main_controller.ino)
- Firmware ESP32-CAM: [../src/hardware/esp32cam_node/esp32cam_node.ino](../src/hardware/esp32cam_node/esp32cam_node.ino)
- Web preview: [../../index.html](../../index.html)
- JS web: [../../app.js](../../app.js)
- CSS web: [../../styles.css](../../styles.css)
- Build config: [../platformio.ini](../platformio.ini)
- Partition face IDs: [../partitions_esp32cam_face.csv](../partitions_esp32cam_face.csv)

---

## 10. Kết luận

Bản hiện tại vẫn giữ wiring phần cứng tối giản:

```text
GPIO21 -> LED đúng
GPIO19 -> LED sai
GPIO22 -> Servo signal
```

Phần mới chủ yếu nằm ở ESP32-CAM và web preview: ESP32-CAM xử lý face detection/recognition, còn web chỉ gọi endpoint và hiển thị stream/snapshot/metadata.
