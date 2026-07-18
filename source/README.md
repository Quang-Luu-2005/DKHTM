# Sentinel — hệ thống kiểm soát ra vào

Sentinel kết nối dashboard React, backend Node.js/Express, PostgreSQL và hai node ESP32:

- `software/frontend`: dashboard React/Vite (`http://localhost:3000`).
- `software/backend`: REST API, SSE realtime, command queue và lưu dữ liệu (`http://localhost:3001`).
- `hardware/esp32cam_node`: camera gửi device event và snapshot JPEG.
- `hardware/main_controller`: điều khiển servo/LED/buzzer, nhận lệnh khóa/mở.
- `docs/backend_sentinel_v1_plan.md`: đặc tả backend v1.

Luồng chính: ESP32-CAM gửi event/ảnh vào backend; dashboard đọc REST và SSE; lệnh phần cứng từ dashboard được backend chuyển tới main controller và theo dõi acknowledgement.

## 1. Chuẩn bị

Cài Node.js 20+ (khuyến nghị 22), Docker Desktop + Compose v2, và PlatformIO nếu cần nạp firmware.

```powershell
node --version
docker --version
docker compose version
pio --version
```

Các lệnh dưới đây chạy từ thư mục gốc repo (`D:\DKHTM\source`).

## 2. Tạo file `.env`

```powershell
Copy-Item software/backend/.env.example software/backend/.env
Copy-Item software/frontend/.env.example software/frontend/.env.local
```

Trong `software/backend/.env`, kiểm tra:

```dotenv
DATABASE_URL=postgresql://sentinel:sentinel@localhost:5432/sentinel?schema=public
DEVICE_SECRET=demo-secret
CONTROLLER_URL=
```

Để trống `CONTROLLER_URL` cho tới khi biết IP main controller. Trong frontend, để trống `VITE_API_URL` khi chạy local; đặt `VITE_CAMERA_URL=http://<IP-ESP32-CAM>` nếu muốn xem camera thật.

## 3. Chạy toàn bộ phần mềm bằng Docker + Vite

Docker chạy PostgreSQL và backend. Backend tự chạy Prisma migration trước khi start:

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Kiểm tra backend:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

Mở terminal thứ hai để chạy dashboard:

```powershell
cd software/frontend
npm install
npm run dev
```

Mở `http://localhost:3000`. Vite proxy `/api` tới backend, còn `/api/events` là SSE realtime.

Dừng hệ thống:

```powershell
docker compose stop       # dừng, giữ dữ liệu
docker compose down       # xóa container, giữ volume
docker compose down -v    # xóa cả database/uploads (MẤT DỮ LIỆU)
```

## 4. Chạy backend local để debug

PostgreSQL vẫn chạy trong Docker, Node.js chạy trực tiếp trên máy:

```powershell
docker compose up -d postgres
cd software/backend
npm install
npx prisma generate
npm run prisma:deploy
npm run dev
```

Khi backend chạy local, `DATABASE_URL` dùng `localhost`. Khi backend chạy trong container, Compose dùng hostname `postgres`.

## 5. PostgreSQL và Prisma

Schema ở `software/backend/prisma/schema.prisma`; database mới bắt đầu rỗng, không seed demo. Ảnh snapshot nằm trong volume Docker `sentinel-uploads`, PostgreSQL chỉ lưu metadata/path.

```powershell
cd software/backend
npx prisma migrate status
npm run prisma:migrate
npm run prisma:deploy
npx prisma studio
```

## 6. Cấu hình và nạp ESP32

Sửa Wi-Fi trong `hardware/esp32cam_node/config.h` và `hardware/main_controller/main_controller.ino`. Trên ESP32-CAM, đặt `kServerBaseUrl` tới IP LAN máy chạy backend, ví dụ `http://192.168.1.188:3001`; không dùng `localhost`. `kDeviceSecret` phải trùng `DEVICE_SECRET`.

```powershell
pio run -e esp32cam_node
pio run -e esp32_main_controller
pio run -e esp32cam_node -t upload --upload-port COM5
pio run -e esp32_main_controller -t upload --upload-port COM6
pio device monitor --port COM5 -b 115200
pio device monitor --port COM6 -b 115200
```

Sau khi main controller in ra IP, điền `CONTROLLER_URL=http://<IP-CONTROLLER>` rồi chạy lại backend. Hardware command đi qua `PENDING → SENT → ACKED` hoặc `TIMEOUT`.

### Gate control state machine

Main controller điều khiển cổng theo state machine không chặn:

```text
CLOSED -> OPENING -> HOLDING -> CLOSING -> CLOSED
```

- `grant` mở servo, giữ cổng trong 3 giây rồi tự đóng.
- Gửi lại `grant` trong lúc `HOLDING` sẽ gia hạn thời gian giữ.
- `lock` ngắt trạng thái mở/giữ và đóng cổng ngay.
- Serial Monitor và HTTP API vẫn hoạt động trong lúc cổng chờ tự đóng vì firmware dùng `millis()` thay cho `delay()`.
- `GET /api/hardware/status` trả thêm `gateState`, `remainingHoldMs` và `holdDurationMs`.

Các lệnh Serial: `grant`, `deny`, `lock`, `idle`, `status`, `help`.

## 7. Kiểm thử

```powershell
cd software/backend
npm test
$env:RUN_INTEGRATION='1'; node --test test/api.integration.test.js
cd ..\frontend
npm run lint
npm run build
```

Các endpoint chính: `/api/users`, `/api/logs`, `/api/hardware`, `/api/device/events`, `/api/device/camera/snapshot`, `/api/device/:id`, `/api/events` (SSE), `/api/health`.

## 8. Xử lý lỗi nhanh

- Database chưa connected: `docker compose ps` và `docker compose logs postgres`.
- Port 5432/3000/3001 bị chiếm: dừng tiến trình hoặc đổi port mapping.
- ESP32 không gửi event: kiểm tra cùng LAN, IP backend, secret và serial monitor.
- Command timeout: kiểm tra `CONTROLLER_URL` và IP main controller.
- Camera không hiện: đặt `VITE_CAMERA_URL`, rồi restart Vite.

Sau khi sửa backend đang chạy bằng Docker:

```powershell
docker compose up -d --build backend
```
