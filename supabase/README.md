# Sentinel Supabase

Migration chính nằm tại `migrations/202608050001_sentinel_schema.sql`.

Các bảng:

- `employees`: hồ sơ nhân viên và trạng thái RFID/Face ID.
- `devices`: ba thiết bị gate, stream camera và HFR camera.
- `access_events`: toàn bộ sự kiện xác thực nhận từ MQTT.
- `security_alerts`: cảnh báo xác thực và trèo cổng.
- `camera_snapshots`: metadata ảnh vi phạm; file ảnh sẽ nằm trong Supabase Storage.
- Storage bucket `security-snapshots`: bucket riêng tư, chỉ nhận JPEG tối đa 5 MB.

Face embedding không được đưa lên Supabase. Dữ liệu này tiếp tục nằm trong flash của camera HFR.

Sau khi tạo Supabase project, chạy migration bằng SQL Editor hoặc Supabase CLI, rồi thêm vào `src/.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
```

`SUPABASE_SECRET_KEY` chỉ được dùng trong Node server và không được đặt trong biến `VITE_*` hay gửi xuống trình duyệt.
