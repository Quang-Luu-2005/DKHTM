# Bản đồ cấu hình GPIO - ESP32 Automatic Gate

Tài liệu này tổng hợp cấu hình các chân GPIO được sử dụng trong dự án cổng tự động sử dụng Board ESP32 (38-pin).

---

## 1. Bảng tổng hợp đấu nối chân (GPIO Mapping Table)

| Thiết bị | Tên chân thiết bị | Chân ESP32 (GPIO) | Chức năng trong code | Ghi chú / Cảnh báo |
| :--- | :--- | :--- | :--- | :--- |
| **RFID (MFRC522)** | SDA (SS) | **GPIO 5** | SPI Chip Select | Kết nối SPI |
| | SCK | **GPIO 18** | SPI Clock | Kết nối SPI |
| | MISO | **GPIO 19** | SPI Master In Slave Out | Kết nối SPI |
| | MOSI | **GPIO 23** | SPI Master Out Slave In | Kết nối SPI |
| | RST | **GPIO 16** | Reset Pin | Đã đổi từ GPIO 2 sang 16 để tránh lỗi Bootmode |
| | 3.3V | **3.3V** | Cấp nguồn cho RFID | **CHỈ cấp nguồn 3.3V** (Cấp 5V sẽ cháy module) |
| | GND | **GND** | Nối đất chung | |
| **Cổng (Servo)** | Signal (PWM) | **GPIO 26** | Điều khiển Servo | Sử dụng thư viện ESP32Servo |
| | VCC | **5V / Vin** | Nguồn nuôi Servo | Khuyên dùng 5V (từ Vin hoặc nguồn ngoài lớn hơn) |
| | GND | **GND** | Nối đất chung | |
| **Đèn LED** | Green LED | **GPIO 32** | Đèn báo trạng thái Mở | Cần đấu nối tiếp với điện trở hạn dòng (220Ω - 330Ω) |
| | Red LED | **GPIO 33** | Đèn báo trạng thái Đóng/Lỗi | Cần đấu nối tiếp với điện trở hạn dòng (220Ω - 330Ω) |
| | Cathode (-) | **GND** | Chân âm chung | |
| **Cảm biến siêu âm** | Trig | **GPIO 12** | Kích hoạt phát sóng siêu âm | |
| (HC-SR04) | Echo | **GPIO 13** | Nhận sóng siêu âm phản hồi | Cần dùng cầu phân áp từ 5V xuống 3.3V |
| | VCC | **5V** | Nguồn nuôi cảm biến | |
| | GND | **GND** | Nối đất chung | |
| **Còi báo (Buzzer)**| Signal | **GPIO 21** | Điều khiển còi báo | Sử dụng kênh LEDC PWM để phát âm thanh |
| (Còi chíp) | GND | **GND** | Nối đất chung | |
| **Nút nhấn** | Signal | **GPIO 17** | Nhận tín hiệu nhấn nút | Chế độ active-HIGH, cần điện trở kéo xuống (Pull-down) |

---

## 2. Chi tiết và Lưu ý phần cứng quan trọng

### 1. RFID MFRC522 (Đã cập nhật RST sang GPIO 16)
* Chân RST đã được đổi thành **GPIO 16** (được khởi tạo qua `RFID rfid(5, 16);` trong `main.cpp`). Điều này giúp ESP32 khởi động bình thường mà không bị kẹt ở chế độ nạp flash (bootmode) như khi dùng chân GPIO 2 cũ.
* Hãy đảm bảo chân nguồn của module RFID được nối đúng vào chân **3.3V** của ESP32 chứ không phải chân 5V.

### 2. Cảm biến siêu âm (HC-SR04)
* Cảm biến siêu âm cần nguồn cấp **5V** để hoạt động chính xác.
* Chân **Echo** của HC-SR04 khi phát tín hiệu sẽ ở mức **5V**, trong khi các chân GPIO của ESP32 chỉ hoạt động ở mức **3.3V** và không chịu được điện áp 5V lâu dài.
* **Cách khắc phục:** Sử dụng 2 điện trở để làm mạch chia áp (voltage divider) cho chân Echo trước khi nối vào GPIO 13 của ESP32:
  * Nối một điện trở $1\text{k}\Omega$ giữa chân Echo và GPIO 13.
  * Nối một điện trở $2\text{k}\Omega$ giữa GPIO 13 và GND.

### 3. Nút nhấn (Button)
* Trong file `Button.cpp`, nút nhấn được cấu hình là `INPUT` ở mức tích cực cao (`HIGH`).
* **Cách kết nối:**
  * Nối một đầu nút nhấn với nguồn **3.3V**.
  * Đầu còn lại nối vào chân **GPIO 17** đồng thời nối qua một điện trở kéo xuống ($10\text{k}\Omega$) về **GND**. Điều này giữ cho chân GPIO 17 luôn ổn định ở mức LOW khi không nhấn nút và ngăn ngừa tín hiệu bị nhiễu (floating).

### 4. Đèn LED báo hiệu
* Không kết nối trực tiếp LED vào chân GPIO 32 và 33 mà không có điện trở. Dòng điện từ GPIO của ESP32 có thể làm hỏng LED hoặc chân của vi điều khiển. Hãy luôn dùng điện trở từ **220Ω đến 330Ω** nối tiếp với mỗi LED.
