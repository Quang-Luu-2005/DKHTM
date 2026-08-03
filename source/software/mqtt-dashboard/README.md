# Sentinel MQTT dashboard

Profile tương thích với firmware MQTT từ nhánh `main`. Ứng dụng gồm React/Vite và
Express bridge kết nối HiveMQ, nhận sự kiện qua SSE, điều khiển cổng, proxy
ESP32-CAM và gửi cảnh báo SMTP.

## Chạy local

Yêu cầu Node.js 20+ và một MQTT broker/HiveMQ account.

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Sau khi điền thông tin MQTT trong `.env.local`:

- Vite dashboard: `http://localhost:3000`
- Express/MQTT bridge: `http://localhost:3001`
- MQTT upload topic mặc định: `/board/upload/data`
- MQTT command topic mặc định: `/board/get/data`

Dashboard gửi các lệnh `open`, `close`, `normal`, `led_green`, `led_red`,
`buzzer_on`, `buzzer_off` và `reset_violation`.

Không chạy bridge này cùng `software/backend` trên port `3001`. Nếu cần chạy song
song, đổi `SERVER_PORT` và cập nhật proxy `/api` trong `vite.config.ts`.

Firmware tương ứng nằm ở:

- `../../hardware/mqtt_main_controller`
- `../../hardware/esp32cam_gateway`

Thông tin thật chỉ đặt trong `.env.local`; file này đã được `.gitignore` loại trừ.
