# ESP32-CAM — Ghi chú xử lý kết nối, snapshot và live stream

Ngày ghi nhận: 2026-07-18

## 1. Mục đích

Tài liệu này ghi lại quá trình chẩn đoán và xử lý luồng camera của hệ thống
Sentinel để có thể tra cứu lại khi thay mạng, nạp lại firmware hoặc tiếp tục
phát triển nhận diện khuôn mặt.

Các phần cần phân biệt:

- **Snapshot upload**: ESP32-CAM chụp một ảnh JPEG rồi POST lên backend để lưu.
- **Live stream**: trình duyệt kết nối trực tiếp tới endpoint MJPEG của ESP32-CAM.
- **Face detection/recognition**: xử lý AI trên frame; hiện đang tạm tắt vì bản
  Arduino-ESP32 đang dùng không có các ESP-DL model header tương thích.

## 2. Kiến trúc luồng dữ liệu hiện tại

```text
Snapshot:
OV2640 -> ESP32-CAM -> POST JPEG -> Backend :3001 -> PostgreSQL/uploads

Live stream:
OV2640 -> ESP32-CAM /stream -> trình duyệt <img> trên dashboard
```

Live stream không đi qua backend. Nhật ký `CAMERA SNAPSHOT UPLOADED` chỉ xác
nhận đường snapshot đã thành công, không khẳng định endpoint `/stream` đang được
trình duyệt hiển thị.

## 3. Các lỗi đã gặp và cách xử lý

### 3.1. Camera khởi tạo thành công nhưng gửi sự kiện trả `status: -1`

Log ban đầu:

```text
WiFi connected. IP: 192.168.1.210
Camera initialized.
Preview server started.
JSON response:
Send camera event CAMERA_ONLINE status: -1
```

`-1` không phải HTTP status từ backend. Đây là lỗi kết nối xảy ra trước khi nhận
được HTTP response. Nguyên nhân là `kServerBaseUrl` trong
`hardware/esp32cam_node/config.h` trỏ tới IP cũ `192.168.1.10`, trong khi máy
chạy backend sử dụng địa chỉ Wi-Fi `192.168.1.31` tại thời điểm kiểm tra.

Cấu hình được sửa theo IP máy chạy backend:

```cpp
constexpr char kServerBaseUrl[] = "http://192.168.1.31:3001";
```

Sau khi sửa phải build và nạp lại firmware. Kết quả đúng thường là:

```text
Send camera event CAMERA_ONLINE status: 201
Upload snapshot status: 201
```

Các địa chỉ trên do DHCP cấp và có thể thay đổi. Không nên xem chúng là cấu hình
cố định lâu dài.

### 3.2. Dashboard chỉ hiển thị ảnh minh họa

`software/frontend/.env.local` ban đầu để trống `VITE_CAMERA_URL`. Khi biến này
trống, `DashboardView.tsx` chủ động dùng ảnh Google làm fallback.

Cấu hình dùng trong lần kiểm tra:

```env
VITE_API_URL=
VITE_CAMERA_URL=http://192.168.1.210
```

`VITE_API_URL` được giữ trống trong môi trường phát triển để Vite proxy `/api`
tới `http://localhost:3001`. Sau khi thay `.env.local` phải khởi động lại Vite.

### 3.3. Thẻ camera bị lỗi ảnh dù `/capture` hoạt động

Frontend từng yêu cầu URL:

```text
/stream?detect=1&detectEvery=5&quality=60&delay=0
```

Kiểm tra `/status` cho kết quả:

```json
{
  "cameraReady": true,
  "faceDetectionAvailable": false,
  "faceRecognitionAvailable": false,
  "faceEngineMessage": "Face detection/recognition is unavailable: this Arduino-ESP32 installation does not include esp-dl model headers."
}
```

Vì frontend bắt buộc `detect=1`, firmware trả HTTP `503 Service Unavailable` và
trình duyệt hiển thị biểu tượng ảnh lỗi. Endpoint không nhận diện vẫn hoạt động:

```text
GET /stream -> 200 OK
Content-Type: multipart/x-mixed-replace; boundary=frame
```

Cách xử lý tạm thời trong
`software/frontend/src/components/DashboardView.tsx`:

```tsx
// Tạm giữ lại URL có nhận diện để bật lại sau khi firmware có ESP-DL phù hợp.
// const cameraStreamWithDetectionUrl = `${cameraBaseUrl}/stream?detect=1&detectEvery=5&quality=60&delay=0`;

const cameraStreamUrl = cameraBaseUrl
  ? `${cameraBaseUrl}/stream`
  : fallbackImageUrl;
```

### 3.4. Stream hiển thị đen trắng

Camera không phát ảnh đen trắng. Frontend từng áp các class Tailwind:

```tsx
grayscale brightness-75 contrast-[1.05]
```

Các filter này đã được bỏ. Thẻ ảnh hiện dùng:

```tsx
className="w-full h-full object-cover"
```

Đây là màu nhận trực tiếp từ camera, không còn filter CSS. Lưu ý firmware vẫn
đang gọi `sensor->set_saturation(sensor, -1)`, nên độ bão hòa từ cảm biến được
giảm nhẹ. Có thể đổi thành `0` nếu cần màu trung tính theo mặc định của sensor.

## 4. Vì sao live stream hiện tại tương đối mượt

### 4.1. Camera xuất JPEG trực tiếp

Trong `hardware/esp32cam_node/camera_service.h`:

```cpp
config.pixel_format = PIXFORMAT_JPEG;
config.frame_size = FRAMESIZE_QVGA;
config.jpeg_quality = 12;
```

OV2640 và driver camera tạo sẵn JPEG. Khi không nhận diện, ESP32 chuyển tiếp
buffer JPEG thẳng tới client, không phải decode, vẽ khung rồi encode lại.

### 4.2. Độ phân giải nhỏ vừa đủ cho dashboard

`FRAMESIZE_QVGA` tương ứng `320 x 240`. Frame nhỏ giúp giảm:

- thời gian lấy ảnh;
- dung lượng truyền qua Wi-Fi;
- áp lực RAM/PSRAM;
- độ trễ khi trình duyệt giải mã.

### 4.3. Dùng hai frame buffer trong PSRAM

Khi phát hiện PSRAM, firmware dùng:

```cpp
config.fb_count = 2;
config.grab_mode = CAMERA_GRAB_LATEST;
config.fb_location = CAMERA_FB_IN_PSRAM;
```

Hai buffer cho phép camera chuẩn bị frame kế tiếp trong khi frame hiện tại đang
được sử dụng. `CAMERA_GRAB_LATEST` ưu tiên ảnh mới nhất, giảm hiện tượng phát lại
frame cũ khi mạng chậm.

### 4.4. MJPEG được trình duyệt xử lý nguyên bản

`handleStream()` trả một HTTP response liên tục:

```text
Content-Type: multipart/x-mixed-replace; boundary=frame

--frame
Content-Type: image/jpeg
Content-Length: ...

<JPEG bytes>
```

Frontend chỉ gán URL này vào `src` của một thẻ `<img>`. Trình duyệt tự thay frame
MJPEG; React không phải nhận base64, tạo object URL hoặc render component cho
từng frame.

### 4.5. Không chạy AI trên từng frame

Chế độ `detect=1` cần xử lý ảnh, chạy model, vẽ box và có thể encode JPEG lại.
Tạm tắt nhận diện loại bỏ phần tải CPU lớn nhất. Đây là lý do `/stream` mượt hơn
đáng kể so với luồng dự kiến có nhận diện.

### 4.6. Khoảng nghỉ ngắn giữa các frame

`kStreamFrameDelayMs` hiện là `10 ms`. Đây chỉ là khoảng nghỉ tối thiểu của vòng
lặp; FPS thật vẫn phụ thuộc tốc độ camera, kích thước JPEG, chất lượng Wi-Fi và
tốc độ ghi TCP. Không nên hiểu `10 ms` là hệ thống chắc chắn đạt 100 FPS.

## 5. Quy trình kiểm tra nhanh

### 5.1. Kiểm tra backend

```powershell
curl.exe -i http://127.0.0.1:3001/api/health
```

Kỳ vọng: HTTP `200` và `"ok": true`.

### 5.2. Kiểm tra trạng thái camera

```powershell
curl.exe -i http://192.168.1.210/status
```

Kỳ vọng:

```json
{
  "wifiConnected": true,
  "cameraReady": true,
  "ip": "192.168.1.210"
}
```

### 5.3. Kiểm tra ảnh tĩnh

Mở trong trình duyệt:

```text
http://192.168.1.210/capture
```

Nếu `/capture` trả JPEG nhưng URL có `detect=1` trả `503`, lỗi nằm ở face engine,
không nằm ở camera phần cứng.

### 5.4. Kiểm tra stream

Mở trực tiếp khi dashboard chưa sử dụng camera:

```text
http://192.168.1.210/stream
```

Sau khi xác nhận, đóng tab stream trực tiếp rồi mới mở dashboard. Không mở hai
client stream cùng lúc với firmware hiện tại.

### 5.5. Kiểm tra frontend

```powershell
cd software/frontend
npm run build
```

Trong chế độ phát triển, dashboard chạy tại:

```text
http://192.168.1.31:3000
```

Nếu đã đổi `.env.local`, phải khởi động lại Vite. Khi chỉ sửa TSX/CSS, HMR thường
tự cập nhật; có thể dùng `Ctrl + F5` nếu trình duyệt vẫn giữ giao diện cũ.

## 6. Giới hạn kỹ thuật hiện tại

### 6.1. Chỉ nên có một client stream

Firmware dùng `WebServer` trên cổng 80 và `handleStream()` giữ kết nối trong vòng:

```cpp
while (client.connected()) {
  // capture và gửi frame
}
```

Trong thời gian đó, cùng web server không thể phục vụ tốt một client `/stream`
thứ hai. Không mở URL stream trực tiếp đồng thời với dashboard.

### 6.2. Client ngắt có thể làm stream bị giữ

Mã hiện tại chưa kiểm tra đầy đủ giá trị trả về của `client.write()`. Một client
đóng đột ngột có thể khiến vòng stream chưa thoát kịp, làm `/status`, `/capture`
hoặc kết nối stream tiếp theo bị treo. Cách khôi phục tạm thời là đóng mọi tab
stream, reset ESP32-CAM rồi chỉ mở dashboard.

Cải tiến nên thực hiện:

- kiểm tra số byte trả về từ `client.write()`;
- thoát vòng lặp khi ghi thiếu hoặc ghi thất bại;
- đặt timeout cho client;
- bảo đảm trả frame buffer trong mọi nhánh lỗi.

### 6.3. Stream đang chặn tác vụ snapshot định kỳ

Trong `esp32cam_node.ino`, `webServer.handleClient()` và
`processBackendSnapshotTask()` chạy nối tiếp trong cùng `loop()`. Khi
`handleStream()` giữ kết nối lâu, vòng lặp chưa quay lại tác vụ snapshot. Do đó
live stream mượt hiện tại có thể làm snapshot định kỳ và event backend tạm dừng.

Nếu cần vừa stream vừa upload snapshot ổn định, nên:

- tách networking/stream và snapshot thành task có kiểm soát;
- dùng mutex bảo vệ camera vì camera driver/buffer không nên bị truy cập đồng thời;
- giới hạn tần suất snapshot khi đang stream;
- ưu tiên frame mới và bỏ frame cũ thay vì tạo hàng đợi dài.

### 6.4. IP vẫn đang cấu hình thủ công

Giải pháp dài hạn:

- DHCP reservation cho máy backend và ESP32-CAM; hoặc
- mDNS/service discovery cho backend;
- lưu Wi-Fi/backend bằng `Preferences` (NVS);
- mở captive portal khi cấu hình đã lưu không còn dùng được;
- ESP32 gửi `previewUrl` trong `CAMERA_ONLINE`;
- backend lưu URL camera và frontend đọc từ API runtime thay vì phụ thuộc
  `VITE_CAMERA_URL` lúc khởi động.

### 6.5. Thông tin nhạy cảm đang nằm trong firmware source

SSID, mật khẩu Wi-Fi và device secret không nên commit trực tiếp. Nên chuyển sang
file secrets không được Git theo dõi hoặc cấu hình qua NVS/captive portal.

## 7. Hướng phát triển tiếp theo

Thứ tự ưu tiên đề xuất:

1. Sửa vòng stream để thoát chắc chắn khi client ngắt.
2. Chuyển URL camera thành cấu hình runtime từ backend.
3. Thêm trạng thái giao diện: `Đang kết nối`, `Đang phát`, `Mất kết nối` và retry.
4. Đo FPS, kích thước frame và số byte/giây thay vì chỉ đánh giá bằng mắt.
5. Tách stream khỏi tác vụ upload snapshot nhưng dùng mutex camera an toàn.
6. Sau khi stream ổn định mới tích hợp phiên bản ESP-DL/ESP-WHO tương thích.
7. Khi bật AI, không nhất thiết detect mọi frame; có thể detect mỗi 5-10 frame và
   phát xen kẽ frame JPEG gốc để giữ độ mượt.

## 8. Trạng thái sau lần xử lý này

- Backend nhận được event và snapshot từ ESP32-CAM.
- Frontend dùng `VITE_CAMERA_URL=http://192.168.1.210` tại thời điểm kiểm tra.
- Dashboard phát trực tiếp từ `/stream`, không yêu cầu `detect=1`.
- URL nhận diện cũ được giữ dưới dạng comment để phục hồi sau.
- Bộ lọc đen trắng của frontend đã được bỏ.
- `npm run build` của frontend hoàn tất thành công.
- Nhận diện khuôn mặt vẫn chưa khả dụng cho tới khi firmware có ESP-DL model
  header tương thích.
