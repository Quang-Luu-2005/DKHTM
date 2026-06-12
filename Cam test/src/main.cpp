#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

//
// WIFI CONFIG
//

const char* ssid = "itel P55+";
const char* password = "trancaovan";

WebServer server(80);

//
// CAMERA PINS (AI THINKER)
//

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

//
// HANDLE JPEG REQUEST
//

#define FLASH_LED 4

void handleCapture() {

    // Turn on flash
    digitalWrite(FLASH_LED, HIGH);

    delay(150);

    camera_fb_t * fb = esp_camera_fb_get();

    // Turn off flash
    digitalWrite(FLASH_LED, LOW);

    if (!fb) {
        server.send(500, "text/plain", "Camera capture failed");
        return;
    }

    server.sendHeader("Content-Type", "image/jpeg");
    server.sendHeader("Content-Length", String(fb->len));

    server.send_P(
        200,
        "image/jpeg",
        (const char *)fb->buf,
        fb->len
    );

    esp_camera_fb_return(fb);
}

void setup() {
    Serial.begin(115200);
    delay(2000);

    Serial.println("Booting...");

    //
    // CAMERA CONFIG
    //
    pinMode(FLASH_LED, OUTPUT);
    digitalWrite(FLASH_LED, LOW);

    camera_config_t config;

    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;

    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;

    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;

    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;

    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;

    config.xclk_freq_hz = 20000000;

    config.pixel_format = PIXFORMAT_JPEG;

    config.frame_size = FRAMESIZE_XGA;
    //FRAMESIZE_XGA = 1024 x 768
    //FRAMESIZE_SXGA = 1280 x 1024
    //FRAMESIZE_UXGA = 1600 x 1200
    config.jpeg_quality = 8;
    config.fb_count = 1;

    //
    // INIT CAMERA
    //

    esp_err_t err = esp_camera_init(&config);

    if (err != ESP_OK) {
        Serial.printf("Camera init failed: 0x%x\n", err);
        return;
    }

    Serial.println("Camera OK");

    if(psramFound()) {
    Serial.println("PSRAM OK");
}

    //
    // WIFI
    //

    WiFi.begin(ssid, password);

    Serial.print("Connecting to WiFi");

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println("WiFi connected!");

    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    //
    // ROUTES
    //

    server.on("/capture", HTTP_GET, handleCapture);

    server.begin();

    Serial.println("HTTP server started");
}

void loop() {
    server.handleClient();
}