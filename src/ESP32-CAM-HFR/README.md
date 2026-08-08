# ESP32-CAM on-device HFR

Firmware chạy model Espressif FaceRecognition112V1S16 trực tiếp trên
AI-Thinker ESP32-CAM. Camera phát hiện, so khớp và lưu embedding trong
phân vùng flash `fr`; không gửi ảnh, model hoặc embedding lên web.

ESP32-CAM và ESP32 điều khiển trao đổi các gói nhỏ qua ESP-NOW:

- `SCAN_REQUEST` / `SCAN_RESULT` cho xác thực tại cổng.
- `ENROLL_REQUEST` / `ENROLL_PROGRESS` / `ENROLL_RESULT` cho đăng ký ba
  góc khuôn mặt từ web.

Build S16:

```sh
pio run -e hfr-s16
```

Build S8 for comparison:

```sh
pio run -e hfr-s8
```

Sau khi nạp firmware một lần, camera chỉ cần nguồn và Wi-Fi 2.4 GHz
cùng kênh với ESP32 chính. Có thể dùng `STATUS`, `SCAN`,
`ENROLL|employeeId` và `CLEAR` qua Serial để chẩn đoán.
