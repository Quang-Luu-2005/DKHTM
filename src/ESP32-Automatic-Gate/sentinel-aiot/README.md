# Sentinel AIoT admin dashboard

Dashboard giám sát cổng ESP32 qua HiveMQ Cloud. Model HFR S16 chạy trực tiếp
trên ESP32-CAM; web không nhận video, hình ảnh, model hoặc embedding.

Luồng dữ liệu:

`ESP32 -> HiveMQ Cloud -> server.ts -> /api/events -> React`

Server chỉ publish các lệnh quản trị cần thiết để đồng bộ registry RFID,
liên kết thẻ và bắt đầu enrollment khuôn mặt trên ESP32-CAM. Web
không có API mở/khóa cổng, điều khiển LED/buzzer, stream camera,
nhận model hoặc nhận embedding.

## Chạy local

1. Sao chép `.env.example` thành `.env.local` và điền HiveMQ/SMTP.
2. Chạy `npm install`.
3. Chạy `npm run dev`.
4. Mở `http://localhost:3000`.

API chạy tại cổng `3001`; Vite proxy `/api` sang API trong chế độ phát triển.
