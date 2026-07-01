# Hướng dẫn lắp mạch hệ thống kiểm soát ra vào thông minh

> Tài liệu này được viết lại theo hướng **ưu tiên phần cứng**, để bạn có thể bắt đầu lắp mạch trước rồi mới nạp code sau.
>
> Mapping chân trong tài liệu đang bám theo firmware ở [../include/pins/main_controller_pins.h](../include/pins/main_controller_pins.h) và [../include/pins/camera_pins.h](../include/pins/camera_pins.h).

---

## 1. Mục tiêu lắp mạch

Hệ thống chia làm **2 node tách rời**:

1. **ESP32 mạch chính**
   - Đọc thẻ RFID RC522.
   - Điều khiển servo khóa/mở cổng.
   - Đọc cảm biến người đến gần.
   - Đọc cảm biến vượt cổng.
   - Đọc nút mở từ bên trong.
   - Đọc cảm biến cửa.
   - Điều khiển LED và buzzer.

2. **ESP32-CAM**
   - Chụp ảnh khu vực cổng.
   - Gửi ảnh lên backend qua Wi‑Fi.

### Điểm quan trọng

- **ESP32 mạch chính và ESP32-CAM không cần nối tín hiệu trực tiếp với nhau.**
- Hai board hoạt động độc lập và giao tiếp với backend qua Wi‑Fi.
- Nếu bạn muốn bắt đầu lắp nhanh, hãy ưu tiên làm **ESP32 mạch chính trước**.

---

## 2. Danh sách phần cứng cần chuẩn bị

### 2.1. Mạch chính

- 1 x ESP32 DevKit 38 pin / ESP32 Dev Module
- 1 x RC522 RFID
- 1 x Servo SG90 hoặc MG90S
- 1 x Buzzer module
- 1 x LED xanh
- 1 x LED đỏ
- 2 x điện trở 220–330Ω cho 2 LED
- 1 x cảm biến phát hiện người đến gần
- 1 x cảm biến phát hiện vượt cổng / che tia phía trên cổng
- 1 x nút nhấn mở cửa từ bên trong
- 1 x cảm biến cửa (reed switch hoặc limit switch)
- Breadboard, dây jumper, nguồn 5V ổn định

### 2.2. Node camera

- 1 x AI Thinker ESP32-CAM
- 1 x USB-TTL để nạp code
- Nguồn 5V ổn định

---

## 3. Lắp theo thứ tự nào để đỡ rối

Nên đi theo thứ tự này:

1. Lắp **nguồn và mass chung**.
2. Lắp **LED + buzzer** để test xuất tín hiệu.
3. Lắp **servo**.
4. Lắp **RC522**.
5. Lắp **nút nhấn + cảm biến cửa**.
6. Lắp **2 cảm biến IR**.
7. Sau cùng mới làm **ESP32-CAM**.

Cách làm này giúp bạn test từng khối, tránh cắm hết một lần rồi khó tìm lỗi.

---

## 4. Sơ đồ khối phần cứng

```text
ESP32 main controller
├── RC522 RFID (SPI)
├── Servo mở khóa cổng
├── LED xanh
├── LED đỏ
├── Buzzer
├── Cảm biến người đến gần
├── Cảm biến vượt cổng
├── Nút mở từ bên trong
└── Cảm biến cửa

ESP32-CAM
└── Chụp ảnh và gửi backend qua Wi‑Fi
```

---

## 5. Mapping chân cho ESP32 mạch chính

Dùng cho **ESP32 DevKit / ESP32 38 pin / ESP32 Dev Module**.

| Khối | Chân module | Nối vào ESP32 | Ghi chú |
|---|---|---:|---|
| RC522 | SDA / SS | GPIO 5 | Chân SS của SPI |
| RC522 | SCK | GPIO 18 | SPI clock |
| RC522 | MOSI | GPIO 23 | SPI MOSI |
| RC522 | MISO | GPIO 19 | SPI MISO |
| RC522 | RST | GPIO 22 | Reset RC522 |
| Servo | Signal | GPIO 13 | PWM điều khiển servo |
| Buzzer | Signal | GPIO 27 | Code đang bật/tắt mức HIGH/LOW |
| LED xanh | Anode qua điện trở | GPIO 26 | Cathode về GND |
| LED đỏ | Anode qua điện trở | GPIO 25 | Cathode về GND |
| Cảm biến người đến gần | OUT / DO | GPIO 34 | GPIO 34 chỉ input |
| Cảm biến vượt cổng | OUT / DO | GPIO 35 | GPIO 35 chỉ input |
| Nút mở từ bên trong | 1 chân nút | GPIO 33 | Chân còn lại về GND |
| Cảm biến cửa | 1 chân tín hiệu | GPIO 32 | Chân còn lại về GND |

### Nguồn và mass

| Thiết bị | Nguồn khuyến nghị | Ghi chú |
|---|---|---|
| ESP32 main | 5V qua USB hoặc chân VIN/5V | Không cấp sai cực |
| RC522 | 3.3V | **Không cấp 5V** |
| Servo | 5V riêng | Nên dùng nguồn đủ dòng |
| Buzzer module | 3.3V hoặc 5V tùy module | Kiểm tra mức logic đầu vào |
| Cảm biến IR | Ưu tiên 3.3V nếu module hỗ trợ | Đầu OUT không được vượt 3.3V vào ESP32 |

---

## 6. Nối dây chi tiết từng khối

### 6.1. RC522 RFID

Nối như sau:

```text
RC522 3.3V  -> ESP32 3V3
RC522 GND   -> ESP32 GND
RC522 SDA   -> ESP32 GPIO 5
RC522 SCK   -> ESP32 GPIO 18
RC522 MOSI  -> ESP32 GPIO 23
RC522 MISO  -> ESP32 GPIO 19
RC522 RST   -> ESP32 GPIO 22
```

Lưu ý:

- RC522 trong firmware đang dùng **SPI**.
- Chân `IRQ` của RC522 **không dùng**, có thể bỏ trống.
- **Tuyệt đối không cấp 5V cho RC522**.

---

### 6.2. Servo mở khóa cổng

Nối như sau:

```text
Servo signal -> ESP32 GPIO 13
Servo VCC    -> nguồn 5V riêng
Servo GND    -> GND nguồn 5V và GND ESP32 nối chung
```

Nếu dùng servo SG90 thường sẽ có màu dây:

- Đỏ: 5V
- Nâu/đen: GND
- Cam/vàng: Signal

Lưu ý:

- Không nên lấy 5V servo từ chân 3.3V của ESP32.
- Nếu servo rung, reset board hoặc hoạt động chập chờn, nguyên nhân thường là **nguồn yếu hoặc chưa nối mass chung**.
- Firmware đang dùng góc:
  - khóa: `0°`
  - mở: `90°`

---

### 6.3. LED xanh và LED đỏ

Mỗi LED nên đi qua điện trở 220–330Ω.

```text
GPIO 26 -> điện trở -> anode LED xanh
cathode LED xanh -> GND

GPIO 25 -> điện trở -> anode LED đỏ
cathode LED đỏ -> GND
```

Logic hiện tại của code:

- GPIO lên mức `HIGH` -> LED sáng
- GPIO xuống mức `LOW` -> LED tắt

---

### 6.4. Buzzer

Nếu dùng **buzzer module active** thì nối đơn giản:

```text
Buzzer VCC    -> 3.3V hoặc 5V tùy module
Buzzer GND    -> GND
Buzzer Signal -> GPIO 27
```

Lưu ý:

- Firmware hiện tại chỉ bật/tắt buzzer bằng `digitalWrite`, nên **buzzer active** sẽ dễ dùng nhất.
- Nếu bạn dùng buzzer rời công suất lớn hoặc module cần dòng cao, nên qua transistor thay vì kéo trực tiếp từ GPIO.

---

### 6.5. Cảm biến người đến gần

Firmware đang đọc cảm biến này ở `GPIO 34`.

```text
Sensor VCC -> 3.3V hoặc mức an toàn cho module
Sensor GND -> GND
Sensor OUT -> GPIO 34
```

Lưu ý:

- GPIO 34 là **input-only**.
- GPIO 34 **không có pull-up nội**, nên cảm biến phải có đầu ra digital ổn định.
- Nếu module xuất mức 5V ở chân OUT thì **không nối trực tiếp** vào ESP32.

---

### 6.6. Cảm biến vượt cổng

Firmware đang đọc cảm biến này ở `GPIO 35`.

```text
Sensor VCC -> 3.3V hoặc mức an toàn cho module
Sensor GND -> GND
Sensor OUT -> GPIO 35
```

Lưu ý tương tự GPIO 34:

- GPIO 35 là **input-only**.
- Không đưa mức 5V trực tiếp vào chân ESP32.

---

### 6.7. Nút mở từ bên trong

Firmware dùng `INPUT_PULLUP`, vì vậy cách nối đúng là:

```text
1 chân nút -> GPIO 33
1 chân nút -> GND
```

Khi nhấn nút:

- tín hiệu sẽ xuống `LOW`
- firmware hiểu là **đã nhấn nút mở cửa**

Không cần điện trở kéo ngoài nếu bạn giữ đúng cách nối này.

---

### 6.8. Cảm biến cửa

Firmware đang dùng `GPIO 32` với `INPUT_PULLUP`.

Cách nối đơn giản nhất:

```text
1 chân cảm biến cửa -> GPIO 32
1 chân còn lại      -> GND
```

Bạn có thể dùng:

- reed switch
- công tắc hành trình
- công tắc từ cửa

Lưu ý:

- Code hiện tại đang coi `LOW` là trạng thái cửa đang mở.
- Nếu phần cứng của bạn cho logic ngược lại, cần đảo logic trong firmware.

---

## 7. Logic tín hiệu mà firmware đang kỳ vọng

Đây là phần rất quan trọng khi bạn lắp mạch:

| Khối | Logic hiện tại |
|---|---|
| LED xanh | `HIGH` là sáng |
| LED đỏ | `HIGH` là sáng |
| Nút mở cửa | `LOW` là đang nhấn |
| Cảm biến cửa | `LOW` là cửa mở |
| Cảm biến IR | mặc định `LOW` là đang kích hoạt |

Phần IR đang cấu hình theo kiểu **active LOW** trong firmware. Nếu module IR của bạn hoạt động theo kiểu ngược lại, cần đổi cờ `kIrActiveLow` trong [../include/pins/main_controller_pins.h](../include/pins/main_controller_pins.h).

---

## 8. Lưu ý nguồn điện để tránh cháy hoặc reset board

### Bắt buộc

- Tất cả các khối phải **nối chung GND**.
- RC522 chỉ dùng **3.3V**.
- Không đưa **5V logic** vào các GPIO của ESP32.
- Servo nên dùng **nguồn 5V riêng**, nhưng vẫn phải nối chung mass với ESP32.

### Khuyến nghị thực tế

- Nếu servo kéo chốt cơ khí nặng, hãy dùng nguồn 5V đủ dòng.
- Đừng cấp mọi thứ qua dây USB yếu nếu thấy servo làm ESP32 reset.
- Nên test từng khối trước khi ghép toàn hệ thống.

---

## 9. Cách lắp nhanh trên breadboard

Nếu bạn đang làm bản demo trước, có thể đi theo layout này:

### Thanh nguồn

- 1 thanh GND chung cho toàn bộ mạch.
- 1 thanh 3.3V cho RC522.
- 1 nhánh 5V riêng cho servo.

### Cắm theo cụm

- Cụm 1: ESP32 + LED + buzzer
- Cụm 2: RC522 gần ESP32 để dây SPI ngắn
- Cụm 3: nút nhấn + cảm biến cửa
- Cụm 4: 2 cảm biến IR
- Cụm 5: servo đặt gần cơ cấu khóa

Mẹo:

- Dây SPI của RC522 nên ngắn và chắc.
- Dây servo nguồn nên đủ tốt, không quá lỏng.
- Khi test cảm biến IR, chỉnh biến trở trên module để ra mức digital ổn định.

---

## 10. ESP32-CAM cần lắp như thế nào

ESP32-CAM là node riêng, **không nối GPIO sang ESP32 main**.

Bạn chỉ cần quan tâm 2 việc:

1. **Cấp nguồn ổn định**
2. **Nạp code qua USB-TTL**

### Nối tối thiểu để nạp code

```text
USB-TTL 5V  -> ESP32-CAM 5V
USB-TTL GND -> ESP32-CAM GND
USB-TTL TX  -> ESP32-CAM U0R
USB-TTL RX  -> ESP32-CAM U0T
IO0 -> GND khi vào chế độ flash
```

Sau khi nạp xong:

- tháo `IO0` khỏi GND
- reset board
- cấp nguồn ổn định để camera chạy

### Mapping camera trong firmware

Pin map camera đang bám theo board **AI Thinker ESP32-CAM** tại [../include/pins/camera_pins.h](../include/pins/camera_pins.h).

---

## 11. Trình tự test sau khi lắp xong

### Bước 1: Test nguồn

- [ ] ESP32 lên nguồn ổn định
- [ ] Không có linh kiện nào nóng bất thường
- [ ] Servo chưa chạy nhưng không làm sụt áp mạch

### Bước 2: Test LED và buzzer

- [ ] LED xanh sáng đúng
- [ ] LED đỏ sáng đúng
- [ ] Buzzer kêu được

### Bước 3: Test servo

- [ ] Servo về vị trí khóa
- [ ] Servo quay được sang góc mở
- [ ] Khi servo quay, ESP32 không bị reset

### Bước 4: Test RC522

- [ ] RC522 nhận thẻ
- [ ] Serial in ra UID thẻ

### Bước 5: Test nút và cảm biến

- [ ] Nhấn nút trong nhà thì mở cửa
- [ ] Cảm biến cửa đổi trạng thái đúng
- [ ] Cảm biến người đến gần đổi trạng thái đúng
- [ ] Cảm biến vượt cổng đổi trạng thái đúng

### Bước 6: Test ESP32-CAM

- [ ] Camera khởi tạo thành công
- [ ] Chụp ảnh được
- [ ] Upload ảnh được qua Wi‑Fi

---

## 12. File firmware liên quan để đối chiếu khi debug

Nếu lắp xong nhưng phần cứng chạy chưa đúng, đối chiếu các file sau:

- Mapping chân: [../include/pins/main_controller_pins.h](../include/pins/main_controller_pins.h)
- Khởi tạo cảm biến: [../src/main_controller/sensors.cpp](../src/main_controller/sensors.cpp)
- Điều khiển servo: [../src/main_controller/gate_control.cpp](../src/main_controller/gate_control.cpp)
- LED và buzzer: [../src/main_controller/indicators.cpp](../src/main_controller/indicators.cpp)
- Nút mở cửa: [../src/main_controller/exit_button.cpp](../src/main_controller/exit_button.cpp)
- Entry point mạch chính: [../src/main_controller/main.cpp](../src/main_controller/main.cpp)

---

## 13. Kết luận

Nếu bạn muốn bắt đầu demo nhanh, hãy lắp theo đúng thứ tự này:

1. ESP32 main + LED + buzzer
2. Servo
3. RC522
4. Nút mở cửa + cảm biến cửa
5. 2 cảm biến IR
6. ESP32-CAM

Phần dễ sai nhất khi lắp thực tế là:

- cấp nhầm **5V cho RC522**
- **quên nối GND chung** giữa servo và ESP32
- dùng cảm biến xuất **5V logic** nối thẳng vào GPIO ESP32
- đấu nút/cảm biến cửa sai kiểu so với `INPUT_PULLUP`

Làm đúng 4 điểm trên thì bạn sẽ vào giai đoạn test firmware nhanh hơn rất nhiều.
