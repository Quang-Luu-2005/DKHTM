# ESP32-CAM gateway

Firmware AI-Thinker ESP32-CAM gọn nhẹ cung cấp endpoint capture, control và MJPEG
stream cho `../../software/mqtt-dashboard`.

## Cấu hình và build

```powershell
Copy-Item include/wifi_secrets.example.h include/wifi_secrets.h
pio run
pio run -t upload --upload-port COM5
pio device monitor --port COM5 -b 115200
```

Điền Wi-Fi vào `include/wifi_secrets.h`. Dashboard đọc địa chỉ camera từ
`ESP32_CAM_URL` và `ESP32_CAM_STREAM_URL` trong `.env.local`.
