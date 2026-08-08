# ESP-CAM-Strean

Firmware stream MJPEG cho camera gan tai `COM10`. Camera nay chi truyen hinh
len dashboard; camera HFR tai `COM3` tiep tuc detect va recognize khuon mat.

## Cau hinh Wi-Fi

Mo file `../.env` (tuc `src/.env`) va dien:

```dotenv
WIFI_SSID=ten_wifi
WIFI_PASSWORD=mat_khau_wifi
CAMERA_HOSTNAME=sentinel-stream-cam
STREAM_PORT=81
```

`src/.env` va header sinh tu no da duoc bo qua khoi Git. Mat khau khong duoc in ra
Serial hoac log build.

## Build va nap COM10

```powershell
pio run
pio run --target upload
pio device monitor
```

Neu dung mach nap USB-UART roi, noi `GPIO0` voi `GND` va reset de nap. Sau khi
nap xong, thao noi `GPIO0-GND` va reset lai de firmware chay.

Khi Wi-Fi ket noi thanh cong, Serial se in:

```text
STREAM_CAMERA|stream=http://<camera-ip>:81/stream
```

Endpoint:

- `http://<camera-ip>/` - trang xem nhanh.
- `http://<camera-ip>/status` - trang thai JSON.
- `http://<camera-ip>/capture` - anh JPEG.
- `http://<camera-ip>:81/stream` - MJPEG stream cho dashboard.
