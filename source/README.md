# Firmware hệ thống kiểm soát ra vào thông minh

Thư mục này chứa toàn bộ code firmware PlatformIO cho hệ thống trong `docs/planning_code_esp32_access_control.md`.

## Cấu trúc

```text
source/
├── platformio.ini                  # Cấu hình build cho 2 board
├── docs/                           # Tài liệu/spec gốc
├── include/
│   ├── camera_node/                # Header riêng cho ESP32-CAM
│   ├── common/                     # Wi-Fi và HTTP backend dùng chung
│   ├── config/                     # Cấu hình runtime và secret mẫu
│   ├── main_controller/            # Header riêng cho ESP32 mạch chính
│   └── pins/                       # Sơ đồ chân phần cứng
└── src/
    ├── camera_node/                # Firmware ESP32-CAM
    ├── common/                     # Logic dùng chung
    └── main_controller/            # Firmware ESP32 mạch chính
```

## Build

```bash
pio run -e esp32cam_node
pio run -e esp32_main_controller
```

Nếu `pio` chưa có trong PATH trên Windows, dùng:

```powershell
& "C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe" run -d source -e esp32cam_node
& "C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe" run -d source -e esp32_main_controller
```

## Cấu hình trước khi nạp

Copy file mẫu:

```text
source/include/config/secrets.example.h
```

thành:

```text
source/include/config/secrets.h
```

Sau đó sửa Wi-Fi, backend URL và secret thật. Backend URL phải là IP LAN mà ESP32 truy cập được, không dùng `localhost`.
