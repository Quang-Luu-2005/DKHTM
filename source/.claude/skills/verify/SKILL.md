---
name: verify
summary: Verify ESP32 firmware builds and, when connected, hardware behavior.
---

# Verify firmware changes

## ESP32-CAM

1. Clean-build from the `source` workspace:
   - `"/c/Users/ADMIN/.platformio/penv/Scripts/pio.exe" run -e esp32cam_node -t clean`
   - `"/c/Users/ADMIN/.platformio/penv/Scripts/pio.exe" run -e esp32cam_node`
2. List serial ports with `pio device list` or `Get-CimInstance Win32_SerialPort`.
3. If an ESP32-CAM port is present, upload with IO0 connected to GND, then disconnect IO0, reset, and monitor at 115200 baud.
4. Observe `Camera initialized.`, Wi-Fi IP output, then call `/status`, `/capture`, and `/stream` from the web preview.

## ESP32 main controller

Build with `"/c/Users/ADMIN/.platformio/penv/Scripts/pio.exe" run -e esp32_main_controller`.

## Limitation

A successful build does not verify camera, Wi-Fi, face recognition, upload, or Serial Monitor behavior. If no serial port is present, report hardware runtime verification as blocked rather than passed.
