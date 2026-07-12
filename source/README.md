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
            │   ├── app_state.h
            │   ├── backend_client.h
            │   ├── camera_service.h
            │   ├── config.h
            │   ├── esp32cam_node.ino
            │   ├── face_engine.h
            │   ├── json_utils.h
            │   ├── types.h
            │   ├── web_handlers.h
            │   └── web_server.h
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

Mở trực tiếp [src/hardware/esp32cam_node/esp32cam_node.ino](src/hardware/esp32cam_node/esp32cam_node.ino). Tất cả module `.h` nằm chung thư mục với file `.ino`, mỗi file `.h` tự chứa cả khai báo và phần code để Arduino IDE đọc sketch dễ hơn.

- Board: `AI Thinker ESP32-CAM`
- Chọn `Tools > Port` đúng cổng COM của USB-TTL trước khi Verify/Upload.
- Nếu Arduino IDE không hiện port, kiểm tra driver USB-TTL (CH340/CP210x/FTDI), cáp/dây, nguồn 5V và Device Manager; việc hiện COM port không phụ thuộc cách chia file code.
- Cần PSRAM để chạy face detection ổn định.
- Sửa cấu hình ở [src/hardware/esp32cam_node/config.h](src/hardware/esp32cam_node/config.h) trước khi nạp:
  - `kWifiSsid`
  - `kWifiPass`
  - `kServerBaseUrl` nếu bật upload backend
  - `kDeviceSecret` nếu bật upload backend
- `kEnableBackendUpload` mặc định là `false` để chỉ dùng web preview cục bộ.
- Face recognition cần Arduino-ESP32/ESP32 core có kèm `esp-dl` model headers. Nếu Arduino IDE của bạn thiếu `model_zoo/face_recognition_112_v1_s8.hpp`, firmware vẫn compile được nhưng các endpoint face sẽ báo unavailable; cập nhật ESP32 board package hoặc dùng PlatformIO env `esp32cam_node` để bật đủ face detection/recognition.
- Face recognition cần partition `fr` trong [partitions_esp32cam_face.csv](partitions_esp32cam_face.csv). PlatformIO đã dùng file này; khi nạp bằng Arduino IDE phải dùng partition scheme tùy chỉnh tương ứng, nếu không recognition sẽ báo partition `fr` unavailable.

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
   - **Fast Stream** để xem `/stream` mượt nhất, không detect.
   - **Stream + Box Balanced** để xem `/stream?detect=1&detectEvery=5&quality=60&delay=0`.
   - **Box Every Frame** để xem `/stream?detect=1&detectEvery=1&quality=68&delay=0` nếu muốn detect sát hơn.
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
| `/stream` | Trả live stream MJPEG nhanh nhất, không chạy face detection |
| `/stream?detect=1&detectEvery=5&quality=60&delay=0` | Trả live stream MJPEG có box, detect mỗi 5 frame, nén nhẹ hơn và bỏ delay để cân bằng FPS |
| `/stream?detect=1&detectEvery=1&quality=68&delay=0` | Trả live stream MJPEG có box từng frame, vẫn nặng hơn nhưng đã tối ưu hơn trước |
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

- Firmware ESP32-CAM luôn dùng `esp32-camera`; phần face detection/recognition cần `esp-dl` legacy model headers. PlatformIO env `esp32cam_node` đang dùng Arduino-ESP32 2.0.17 có đủ headers này. Nếu Arduino IDE dùng ESP32 core 3.x không có `esp-dl/model_zoo`, firmware sẽ tự tắt face detection/recognition và vẫn chạy camera/stream/status.
- `source/partitions_esp32cam_face.csv` thêm partition `fr` để lưu face IDs; đổi partition layout có thể làm mất dữ liệu flash cũ khi nạp lại.
- Face detection chạy cho stream/snapshot để vẽ box.
- Stream đã có 3 mode: `/stream` nhanh nhất, `/stream?detect=1&detectEvery=5&quality=60&delay=0` cân bằng, `/stream?detect=1&detectEvery=1&quality=68&delay=0` detect từng frame.
- Firmware hỗ trợ query `detectEvery`, `quality` và `delay`; giảm `quality` và `delay=0` giúp stream có box đỡ cứng hơn.
- Face recognition chạy theo chế độ snapshot/manual để giảm trễ trên AI Thinker ESP32-CAM thường.
- Khi đăng ký, nên để đúng 1 khuôn mặt rõ trong khung hình.

## Ghi chú chung

- `src/hardware` là code phần cứng Arduino/ESP32.
- Web preview nằm ở root repo: [../index.html](../index.html).
- Firmware ESP32 main hiện là bản demo phần cứng tối giản, điều khiển bằng Serial thay cho RFID/cảm biến.
- Firmware ESP32-CAM tự mở web server trên port 80 để phục vụ preview và endpoint face.
- ESP32-CAM firmware dùng layout phẳng cho Arduino IDE: file `.ino` và toàn bộ module `.h` nằm chung trong `src/hardware/esp32cam_node/`.
- Nếu cần sơ đồ đấu dây chi tiết, xem [planning_code_esp32_access_control.md](docs/planning_code_esp32_access_control.md).
