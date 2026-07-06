# Firmware và web preview hệ thống kiểm soát ra vào

Repo này hiện có 2 phần chính:

- [src/hardware/](src/hardware/) — code Arduino/ESP32 để nạp cho phần cứng.
- Web preview tĩnh ở root repo: [../index.html](../index.html), [../app.js](../app.js), [../styles.css](../styles.css).

## Phần cứng đang dùng

### ESP32 mạch chính
- 1 x servo mở/khóa cổng
- 1 x LED đúng
- 1 x LED sai

### ESP32-CAM
- 1 x AI Thinker ESP32-CAM có PSRAM
- Dùng camera để stream/snapshot, phát hiện khuôn mặt realtime trên stream, và nhận diện khuôn mặt theo chế độ snapshot/manual.

## Mapping chân ESP32 mạch chính

| Linh kiện | Chân ESP32 |
|---|---:|
| LED đúng | GPIO 21 |
| LED sai | GPIO 19 |
| Servo signal | GPIO 22 |

Servo nên dùng nguồn 5V riêng và nối chung GND với ESP32.

## Cấu trúc repo hiện tại

```text
.
├── app.js
├── index.html
├── styles.css
└── source/
    ├── docs/
    │   └── planning_code_esp32_access_control.md
    ├── partitions_esp32cam_face.csv
    ├── platformio.ini
    └── src/
        └── hardware/
            ├── esp32cam_node/
            │   └── esp32cam_node.ino
            ├── main_controller/
            │   └── main_controller.ino
            ├── platformio_esp32cam_node.cpp
            └── platformio_main_controller.cpp
```

## Nạp bằng Arduino IDE

### ESP32 mạch chính

Mở file [src/hardware/main_controller/main_controller.ino](src/hardware/main_controller/main_controller.ino).

- Board: `ESP32 Dev Module`
- Library cần cài: `ESP32Servo`
- Serial Monitor: `115200`, line ending `Newline`

Lệnh test qua Serial:
- `grant`, `1`, `d`: bật LED đúng và mở servo trong 3 giây
- `deny`, `0`, `s`: bật LED sai trong thời gian ngắn
- `lock`: đưa servo về vị trí khóa
- `idle`: tắt cả 2 LED
- `help`: in lại hướng dẫn

### ESP32-CAM

Mở file [src/hardware/esp32cam_node/esp32cam_node.ino](src/hardware/esp32cam_node/esp32cam_node.ino).

- Board: `AI Thinker ESP32-CAM`
- Cần PSRAM để chạy face detection ổn định.
- Sửa trực tiếp các hằng số ở đầu file trước khi nạp:
  - `kWifiSsid`
  - `kWifiPass`
  - `kServerBaseUrl` nếu bật upload backend
  - `kDeviceSecret` nếu bật upload backend
- `kEnableBackendUpload` mặc định là `false` để chỉ dùng web preview cục bộ.

Kết nối nạp tối thiểu:

```text
USB-TTL 5V  -> ESP32-CAM 5V
USB-TTL GND -> ESP32-CAM GND
USB-TTL TX  -> ESP32-CAM U0R
USB-TTL RX  -> ESP32-CAM U0T
IO0         -> GND khi nạp code
```

Sau khi nạp xong:
- tháo `IO0` khỏi GND
- reset board
- mở Serial Monitor `115200`
- xem dòng IP dạng `WiFi connected. IP: 192.168.x.x`

## Xem camera và đăng ký khuôn mặt bằng web tĩnh

1. Nạp firmware ESP32-CAM ở [src/hardware/esp32cam_node/esp32cam_node.ino](src/hardware/esp32cam_node/esp32cam_node.ino).
2. Mở Serial Monitor `115200` để lấy IP ESP32-CAM.
3. Mở [../index.html](../index.html) bằng trình duyệt hoặc VS Code Live Server.
4. Nhập địa chỉ dạng `http://192.168.x.x`.
5. Bấm:
   - **Check Status** để kiểm tra `/status`, PSRAM và số khuôn mặt đã đăng ký.
   - **Start Stream + Box** để xem live stream `/stream?detect=1` có box khuôn mặt.
   - **Stop Stream** để dừng stream.
   - **Take Snapshot + Box** để chụp ảnh `/capture?detect=1`.
   - **Recognize Snapshot** để nhận diện manual qua `/capture?detect=1&recognize=1`.
   - Nhập tên rồi bấm **Đăng ký khuôn mặt** để gọi `/face/enroll?name=...`.

ESP32-CAM cung cấp các endpoint:

| Endpoint | Tác dụng |
|---|---|
| `/status` | Trả JSON trạng thái Wi‑Fi/camera/PSRAM/face engine |
| `/capture` | Trả về 1 ảnh JPEG gốc |
| `/capture?detect=1` | Trả snapshot có box khuôn mặt |
| `/capture?detect=1&recognize=1` | Trả snapshot có box và label nhận diện manual |
| `/stream` | Trả live stream MJPEG gốc |
| `/stream?detect=1` | Trả live stream MJPEG có box khuôn mặt |
| `/face/enroll?name=...` | Chụp frame hiện tại và đăng ký 1 khuôn mặt với tên nhập từ web |
| `/face/ids` | Trả danh sách danh tính đã lưu trong flash partition `fr` |
| `/face/last-result` | Trả metadata box/kết quả nhận diện gần nhất |
| `/face/delete?id=...` | Xóa một danh tính đã đăng ký |

Máy mở web và ESP32-CAM cần ở cùng mạng Wi‑Fi.

## Build bằng PlatformIO

Từ thư mục [source/](.) chạy:

```bash
pio run -e esp32_main_controller
pio run -e esp32cam_node
```

Nếu chạy từ root repo thì dùng `-d source`:

```bash
pio run -d source -e esp32_main_controller
pio run -d source -e esp32cam_node
```

Nếu `pio` chưa có trong PATH trên Windows:

```powershell
& "C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe" run -d "d:\DKHTM\source" -e esp32_main_controller
& "C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe" run -d "d:\DKHTM\source" -e esp32cam_node
```

## Ghi chú face detection/recognition

- Firmware ESP32-CAM dùng `esp-dl`/`esp32-camera` có sẵn trong Arduino-ESP32.
- `source/partitions_esp32cam_face.csv` thêm partition `fr` để lưu face IDs; đổi partition layout có thể làm mất dữ liệu flash cũ khi nạp lại.
- Face detection chạy cho stream/snapshot để vẽ box.
- Face recognition chạy theo chế độ snapshot/manual để giảm trễ trên AI Thinker ESP32-CAM thường.
- Khi đăng ký, nên để đúng 1 khuôn mặt rõ trong khung hình.

## Ghi chú chung

- `src/hardware` là code phần cứng Arduino/ESP32.
- Web preview nằm ở root repo: [../index.html](../index.html).
- Firmware ESP32 main hiện là bản demo phần cứng tối giản, điều khiển bằng Serial thay cho RFID/cảm biến.
- Firmware ESP32-CAM tự mở web server trên port 80 để phục vụ preview và endpoint face.
- Nếu cần sơ đồ đấu dây chi tiết, xem [planning_code_esp32_access_control.md](docs/planning_code_esp32_access_control.md).
