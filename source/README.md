# Firmware hệ thống kiểm soát ra vào thông minh

Repo này hiện chỉ giữ **2 firmware chính trực tiếp trong `src/`** để bạn có thể dùng chung cho cả Arduino IDE và PlatformIO, không còn tách module cũ trong `include/`, `src/common/`, `src/camera_node/`, hay `arduino/` nữa.

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
    ├── esp32cam_node/
    │   └── esp32cam_node.ino
    └── main_controller/
        └── main_controller.ino
```

## Nạp bằng Arduino IDE

### ESP32 mạch chính

Mở file [main_controller.ino](src/main_controller/main_controller.ino).

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

Mở file [esp32cam_node.ino](src/esp32cam_node/esp32cam_node.ino).

- Board: `AI Thinker ESP32-CAM`
- Sửa trực tiếp các hằng số ở đầu file trước khi nạp nếu muốn dùng Wi‑Fi/backend:
  - `kWifiSsid`
  - `kWifiPass`
  - `kServerBaseUrl`
  - `kDeviceSecret`

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
- mở Serial Monitor `115200` để kiểm tra camera khởi tạo và upload snapshot

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

- Firmware ESP32 main hiện là bản demo phần cứng tối giản, điều khiển bằng Serial thay cho RFID/cảm biến.
- Firmware ESP32-CAM là sketch self-contained, không phụ thuộc header cấu hình riêng bên ngoài.
- Nếu cần sơ đồ đấu dây chi tiết, xem [planning_code_esp32_access_control.md](docs/planning_code_esp32_access_control.md).
