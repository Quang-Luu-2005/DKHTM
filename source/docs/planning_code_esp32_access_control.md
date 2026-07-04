# Hướng dẫn lắp mạch bản demo tối giản

> Repo hiện tách `src` thành 2 phần:
>
> - [../src/hardware/](../src/hardware/) — code Arduino/ESP32.
> - [../src/software/](../src/software/) — web tĩnh để xem ESP32-CAM.
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
   - Có thể upload ảnh/event lên backend nếu bật cấu hình upload.

### Điểm quan trọng

- ESP32 main và ESP32-CAM **không cần nối GPIO trực tiếp với nhau**.
- Hai board chạy độc lập.
- ESP32 main lo phần cứng cửa/đèn.
- ESP32-CAM lo camera và web preview.
- Máy mở web preview và ESP32-CAM phải cùng mạng Wi‑Fi.

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

- 1 x AI Thinker ESP32-CAM
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
└── Camera + web preview qua Wi‑Fi
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

---

## 7. File firmware và web hiện dùng

| Phần | File |
|---|---|
| ESP32 main | [../src/hardware/main_controller/main_controller.ino](../src/hardware/main_controller/main_controller.ino) |
| ESP32-CAM | [../src/hardware/esp32cam_node/esp32cam_node.ino](../src/hardware/esp32cam_node/esp32cam_node.ino) |
| Web preview | [../src/software/index.html](../src/software/index.html) |

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
2. Sửa Wi‑Fi ở đầu file:
   - `kWifiSsid`
   - `kWifiPass`
3. Chọn board `AI Thinker ESP32-CAM`.
4. Nối `IO0` xuống GND khi nạp.
5. Nạp code, tháo `IO0` khỏi GND và reset.
6. Mở Serial Monitor `115200` để xem IP.

### 7.3. Xem camera bằng web preview

1. Mở [../src/software/index.html](../src/software/index.html) bằng trình duyệt.
2. Nhập địa chỉ ESP32-CAM dạng `http://192.168.x.x`.
3. Bấm **Check Status** để kiểm tra `/status`.
4. Bấm **Start Stream** để xem live stream `/stream`.
5. Bấm **Take Snapshot** để chụp ảnh `/capture`.
6. Bấm **Stop Stream** để dừng stream.

Các endpoint ESP32-CAM cung cấp:

| Endpoint | Tác dụng |
|---|---|
| `/status` | Trả trạng thái Wi‑Fi/camera |
| `/capture` | Chụp và trả về một ảnh JPEG |
| `/stream` | Live stream MJPEG |

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

### Bước 4: Test ESP32-CAM

- [ ] Serial báo `Camera initialized.`
- [ ] Serial báo IP ESP32-CAM
- [ ] Web preview gọi được `/status`
- [ ] Web preview xem được `/capture`
- [ ] Web preview xem được `/stream`

---

## 9. File dùng để debug

- Firmware ESP32 main: [../src/hardware/main_controller/main_controller.ino](../src/hardware/main_controller/main_controller.ino)
- Firmware ESP32-CAM: [../src/hardware/esp32cam_node/esp32cam_node.ino](../src/hardware/esp32cam_node/esp32cam_node.ino)
- Web preview: [../src/software/index.html](../src/software/index.html)
- Build config: [../platformio.ini](../platformio.ini)

---

## 10. Kết luận

Bản hiện tại chỉ cần lắp đúng 3 chân trên ESP32 main:

```text
GPIO21 -> LED đúng
GPIO19 -> LED sai
GPIO22 -> Servo signal
```

Firmware Arduino nằm trong [../src/hardware/](../src/hardware/), còn web xem camera nằm trong [../src/software/](../src/software/).
