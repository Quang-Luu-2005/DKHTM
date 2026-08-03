# MQTT main controller

Firmware ESP32 điều khiển servo, RFID, ultrasonic, LED và buzzer qua HiveMQ. Đây là
firmware tương ứng với `../../software/mqtt-dashboard` được giữ từ nhánh `main`.

## Cấu hình và build

```powershell
Copy-Item include/MQTT_secrets.example.h include/MQTT_secrets.h
pio run
pio run -t upload --upload-port COM6
pio device monitor --port COM6 -b 115200
```

Điền Wi-Fi/MQTT vào `include/MQTT_secrets.h`. Không commit file chứa secret thật.
Sơ đồ chân nằm trong `GPIO_Mapping.md` và cấu hình PlatformIO nằm tại
`platformio.ini` của thư mục này.
