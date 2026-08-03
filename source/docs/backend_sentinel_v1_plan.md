# Sentinel Backend v1 — Kế hoạch triển khai

## 1. Mục tiêu

Xây dựng backend dashboard-first cho hệ thống Sentinel, kết nối frontend React với
PostgreSQL, ESP32-CAM và main controller.

Các quyết định đã chốt:

- Node.js + Express.
- PostgreSQL chạy bằng Docker Compose.
- Prisma migrations + Prisma Client.
- SSE cho log, trạng thái device và hardware command.
- Giữ tương thích các endpoint `/api` hiện tại.
- V1 tập trung camera và main controller.
- RFID/face chỉ dùng event contract mở rộng, chưa xây policy engine riêng.
- Không tự động seed dữ liệu demo từ `localStorage`.
- Chưa có login/JWT ở v1; mạng LAN được xem là môi trường tin cậy.

## 2. Kiến trúc backend

Backend được tách thành các lớp:

```text
software/backend/
├── server.js
├── src/
│   ├── app.js
│   ├── config.js
│   ├── prisma.js
│   ├── domain.js
│   ├── schemas.js
│   ├── events/
│   │   └── sse.js
│   ├── middleware/
│   │   └── http.js
│   ├── routes/
│   │   ├── users.js
│   │   ├── logs.js
│   │   ├── hardware.js
│   │   └── devices.js
│   └── services/
│       ├── user-service.js
│       ├── audit-service.js
│       ├── device-service.js
│       ├── hardware-service.js
│       └── snapshot-service.js
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── test/
```

Request body/query được validate bằng Zod. Middleware chung xử lý CORS, device
secret, async errors, Zod errors và Prisma errors.

## 3. PostgreSQL schema

### `User`

- `id`
- `fullName`
- `role`: Administrator, Security Officer, Technician, General Staff
- `rfidUid`
- `faceIdStatus`: ENROLLED hoặc PENDING
- `avatarUrl`
- `createdAt`, `updatedAt`

### `AuditLog`

- `id`, `timestamp`
- `subjectName`, `subjectId`
- `accessMethod`: Face ID, RFID, Manual Override, Gate Jumping, Tailgating
- `gateId`, `status`, `confidence`
- `avatarUrl`, `source`, `deviceId`, `metadata`

### `Device`

- `id`, `type`: CAMERA hoặc CONTROLLER
- `name`, `gateId`, `ipAddress`
- `online`, `lastSeenAt`, `lastError`
- `capabilities`

### `DeviceEvent`

- `deviceId`, `eventId`, `eventType`, `message`
- `confidence`, `occurredAt`, `receivedAt`, `payload`
- Unique key `(deviceId, eventId)` để chống duplicate event.

### `GateHardwareState`

- `gateId`
- `desiredState`
- `reportedState`
- `connectionStatus`
- `lastReportedAt`, `lastCommandId`

### `HardwareCommand`

- `commandId`, `gateId`, `targetDeviceId`
- `command`, `requestedState`
- `status`: PENDING, SENT, ACKED, FAILED, TIMEOUT
- `retryCount`, `ackPayload`, `lastError`
- `createdAt`, `sentAt`, `acknowledgedAt`, `updatedAt`

### `Snapshot`

- `deviceId`, `gateId`
- `filePath`, `mimeType`, `size`
- `capturedAt`, `eventId`

Ảnh JPEG được lưu trong volume `uploads/`; PostgreSQL chỉ lưu metadata và đường dẫn.

## 4. API contract

Các endpoint tương thích cần giữ:

```text
GET/POST  /api/users
DELETE    /api/users/:id
GET/POST  /api/logs
GET       /api/hardware
PUT       /api/hardware
POST      /api/device/events
POST      /api/device/camera/snapshot
GET       /api/device/camera/snapshot/latest
GET       /api/device/:id
GET       /api/health
GET       /api/events
```

### Cập nhật hardware

`PUT /api/hardware` nhận:

```json
{
  "servoArm": "OPENED / UNSECURED",
  "servoLocked": false,
  "indicatorLed": "GREEN / ACCESS ALLOWED",
  "systemBuzzer": "MUTED"
}
```

Backend lưu desired state, tạo command và trả HTTP `202`:

```json
{
  "commandId": "cmd_...",
  "commandStatus": "PENDING",
  "servoArm": "OPENED / UNSECURED",
  "servoLocked": false,
  "indicatorLed": "GREEN / ACCESS ALLOWED",
  "systemBuzzer": "MUTED"
}
```

Các field hardware cũ vẫn được giữ để frontend hiện tại không bị breaking change.

## 5. Hardware command queue

Backend gửi tới main controller:

```http
POST /api/hardware/command
Content-Type: application/json
```

```json
{
  "commandId": "cmd_123",
  "gateId": "GATE_01",
  "command": "SET_STATE",
  "desiredState": {
    "servoLocked": true,
    "indicatorLed": "RED / RESTRICTED",
    "systemBuzzer": "MUTED"
  }
}
```

Controller trả acknowledgement:

```json
{
  "ok": true,
  "commandId": "cmd_123",
  "hardware": {
    "servoLocked": true,
    "servoArm": "SECURED / CLOSED",
    "indicatorLed": "RED / RESTRICTED",
    "systemBuzzer": "MUTED"
  }
}
```

Quy tắc:

- Timeout mỗi request: 5 giây.
- Retry tối đa: 3 lần.
- Lệnh cùng một gate được dispatch tuần tự.
- Không có acknowledgement sau retry: `TIMEOUT`.
- HTTP/JSON acknowledgement không hợp lệ: `FAILED`.
- Chỉ cập nhật reported state sau acknowledgement thành công.
- Desired state được lưu ngay khi tạo command.
- Mỗi command tạo một audit log.

## 6. Device event contract

ESP32-CAM gửi `x-device-secret` và event dạng:

```json
{
  "eventId": "camera-<boot-id>-<sequence>",
  "deviceId": "ESP32CAM_001",
  "gateId": "GATE_01",
  "source": "ESP32_CAM",
  "eventType": "CAMERA_ONLINE",
  "message": "ESP32-CAM is online",
  "confidence": 0.9,
  "occurredAt": "2026-07-16T..."
}
```

Backend sẽ:

1. Xác thực device secret.
2. Upsert device heartbeat/status.
3. Bỏ qua duplicate `(deviceId, eventId)`.
4. Lưu `DeviceEvent`.
5. Tạo `AuditLog` cho event ảnh hưởng dashboard.
6. Publish SSE event.

Face mismatch, jumping và tailgating vẫn đi qua audit log; v1 chưa có bảng incidents
riêng.

## 7. SSE realtime

Frontend mở:

```http
GET /api/events
Accept: text/event-stream
```

Các event type:

- `hardware.state`
- `hardware.command`
- `device.online`
- `device.offline`
- `device.event`
- `audit.log`
- `snapshot.created`

Payload chuẩn:

```json
{
  "id": "event_...",
  "type": "hardware.command",
  "occurredAt": "2026-07-16T...",
  "data": {}
}
```

Frontend dùng REST cho initial load, SSE cho realtime và REST polling làm fallback khi
SSE bị mất kết nối.

## 8. Docker Compose

Compose gồm:

- `postgres`: PostgreSQL 16, persistent volume, healthcheck.
- `backend`: chạy Prisma migration trước khi start, mount volume `uploads/`, expose port
  `3001`.

Khởi động local:

```powershell
Copy-Item software/backend/.env.example software/backend/.env
docker compose --env-file software/backend/.env up -d postgres

cd software/backend
npm install
npm run prisma:deploy
npm run dev
```

Chạy toàn bộ stack:

```powershell
docker compose --env-file software/backend/.env up -d
```

Không seed users/logs demo mặc định.

## 9. Thứ tự triển khai

1. Prisma schema, Docker Compose, env validation và migration.
2. Repository/service cho users, logs, devices và hardware state.
3. Chuyển REST endpoint từ JSON file sang PostgreSQL.
4. Device event ingestion và snapshot metadata/storage.
5. Command queue, retry, timeout và acknowledgement.
6. Main controller trả `commandId` trong response.
7. SSE publisher/subscriber.
8. Frontend API client dùng SSE và command status.
9. Integration test với PostgreSQL container.

## 10. Kiểm thử và acceptance criteria

- Backend khởi động được với PostgreSQL sạch.
- Prisma migration chạy được từ database rỗng.
- CRUD users/logs không phụ thuộc `localStorage`.
- Duplicate device event không tạo duplicate log.
- JPEG snapshot lưu và truy xuất được.
- Command chuyển đúng `PENDING → SENT → ACKED`.
- Controller không phản hồi chuyển command thành `TIMEOUT` sau retry.
- SSE nhận được log/device/hardware event.
- Cả hai firmware compile bằng PlatformIO.
- Các endpoint `/api` không bị breaking change.
- Không có dữ liệu demo tự động chèn vào PostgreSQL.

## 11. Phạm vi chưa làm trong v1

- Login/JWT và phân quyền dashboard.
- Secret riêng cho từng device.
- MQTT hoặc message broker.
- Policy engine cho RFID/face recognition.
- Bảng incident lifecycle riêng.
- Object storage/S3 cho snapshot.

