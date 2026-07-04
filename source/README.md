# Firmware và web preview hệ thống kiểm soát ra vào

Repo này tách `src` thành 2 phần rõ ràng:

- [src/hardware/](src/hardware/) — code Arduino/ESP32 để nạp cho phần cứng.
- [src/software/](src/software/) — web tĩnh để xem ESP32-CAM đang thấy gì.

## Phần cứng đang dùng

### ESP32 mạch chính
- 1 x servo mở/khóa cổng
- 1 x LED đúng
- 1 x LED sai

### ESP32-CAM
- 1 x AI Thinker ESP32-CAM

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
├── docs/
│   └── planning_code_esp32_access_control.md
├── platformio.ini
└── src/
    ├── hardware/
    │   ├── esp32cam_node/
    │   │   └── esp32cam_node.ino
    │   ├── main_controller/
    │   │   └── main_controller.ino
    │   ├── platformio_esp32cam_node.cpp
    │   └── platformio_main_controller.cpp
    └── software/
        ├── app.js
        ├── index.html
        └── styles.css
```

## Nạp bằng Arduino IDE

### ESP32 mạch chính

Mở file [main_controller.ino](src/hardware/main_controller/main_controller.ino).

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

Mở file [esp32cam_node.ino](src/hardware/esp32cam_node/esp32cam_node.ino).

- Board: `AI Thinker ESP32-CAM`
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

## Xem camera bằng web tĩnh

1. Nạp firmware ESP32-CAM ở [src/hardware/esp32cam_node/esp32cam_node.ino](src/hardware/esp32cam_node/esp32cam_node.ino).
2. Mở Serial Monitor `115200` để lấy IP ESP32-CAM.
3. Mở [src/software/index.html](src/software/index.html) bằng trình duyệt.
4. Nhập địa chỉ dạng `http://192.168.x.x`.
5. Bấm:
   - **Check Status** để kiểm tra `/status`.
   - **Start Stream** để xem live stream `/stream`.
   - **Stop Stream** để dừng stream.
   - **Take Snapshot** để chụp ảnh từ `/capture`.

ESP32-CAM cung cấp các endpoint:

| Endpoint | Tác dụng |
|---|---|
| `/status` | Trả JSON trạng thái Wi‑Fi/camera |
| `/capture` | Trả về 1 ảnh JPEG |
| `/stream` | Trả live stream MJPEG |

Máy mở web và ESP32-CAM cần ở cùng mạng Wi‑Fi.

## Build bằng PlatformIO

Từ thư mục repo hiện tại:

```bash
pio run -e esp32_main_controller
pio run -e esp32cam_node
```

Nếu `pio` chưa có trong PATH trên Windows:

```powershell
& "C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe" run -e esp32_main_controller
& "C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe" run -e esp32cam_node
```

## Ghi chú

- `src/hardware` là code phần cứng Arduino/ESP32.
- `src/software` là web tĩnh để xem camera.
- Firmware ESP32 main hiện là bản demo phần cứng tối giản, điều khiển bằng Serial thay cho RFID/cảm biến.
- Firmware ESP32-CAM tự mở web server trên port 80 để phục vụ preview.
- Nếu cần sơ đồ đấu dây chi tiết, xem [planning_code_esp32_access_control.md](docs/planning_code_esp32_access_control.md).
