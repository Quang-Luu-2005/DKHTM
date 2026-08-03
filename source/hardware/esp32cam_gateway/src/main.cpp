#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "wifi_secrets.h"

// AI-Thinker ESP32-CAM + OV2640 pin map.
#define CAM_PIN_PWDN 32
#define CAM_PIN_RESET -1
#define CAM_PIN_XCLK 0
#define CAM_PIN_SIOD 26
#define CAM_PIN_SIOC 27
#define CAM_PIN_D7 35
#define CAM_PIN_D6 34
#define CAM_PIN_D5 39
#define CAM_PIN_D4 36
#define CAM_PIN_D3 21
#define CAM_PIN_D2 19
#define CAM_PIN_D1 18
#define CAM_PIN_D0 5
#define CAM_PIN_VSYNC 25
#define CAM_PIN_HREF 23
#define CAM_PIN_PCLK 22
#define FLASH_LED_PIN 4

static httpd_handle_t controlServer = nullptr;
static httpd_handle_t streamServer = nullptr;
static bool flashLedEnabled = false;

#define STREAM_BOUNDARY "sentinelcamframe"
static const char* STREAM_CONTENT_TYPE =
  "multipart/x-mixed-replace;boundary=" STREAM_BOUNDARY;
static const char* STREAM_SEPARATOR = "\r\n--" STREAM_BOUNDARY "\r\n";
static const char* STREAM_PART =
  "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static void setCommonHeaders(httpd_req_t* request) {
  httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store, no-cache, must-revalidate");
}

static esp_err_t rootHandler(httpd_req_t* request) {
  static const char html[] PROGMEM = R"HTML(
<!doctype html><html><head><meta name="viewport" content="width=device-width">
<title>Sentinel ESP32-CAM</title></head>
<body style="margin:0;background:#09090b;color:#e2e8f0;font-family:sans-serif;text-align:center">
<h2>Sentinel ESP32-CAM</h2><p><a href="/capture" style="color:#38bdf8">Capture JPEG</a></p>
<img id="stream" style="max-width:100%;height:auto" alt="camera stream">
<script>document.getElementById('stream').src='http://'+location.hostname+':81/stream';</script>
</body></html>)HTML";
  setCommonHeaders(request);
  return httpd_resp_send(request, html, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t statusHandler(httpd_req_t* request) {
  char response[192];
  snprintf(
    response,
    sizeof(response),
    "{\"online\":true,\"hostname\":\"sentinel-cam.local\",\"ip\":\"%s\",\"rssi\":%d,\"flash\":%s}",
    WiFi.localIP().toString().c_str(),
    WiFi.RSSI(),
    flashLedEnabled ? "true" : "false"
  );
  setCommonHeaders(request);
  httpd_resp_set_type(request, "application/json");
  return httpd_resp_send(request, response, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t flashHandler(httpd_req_t* request) {
  char query[48] = {};
  char enabledValue[8] = {};
  if (httpd_req_get_url_query_str(request, query, sizeof(query)) != ESP_OK ||
      httpd_query_key_value(query, "enabled", enabledValue, sizeof(enabledValue)) != ESP_OK) {
    httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Missing enabled query parameter");
    return ESP_FAIL;
  }

  bool requestedState;
  if (strcmp(enabledValue, "1") == 0 || strcmp(enabledValue, "true") == 0) {
    requestedState = true;
  } else if (strcmp(enabledValue, "0") == 0 || strcmp(enabledValue, "false") == 0) {
    requestedState = false;
  } else {
    httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "enabled must be true or false");
    return ESP_FAIL;
  }

  flashLedEnabled = requestedState;
  digitalWrite(FLASH_LED_PIN, flashLedEnabled ? HIGH : LOW);

  char response[48];
  snprintf(response, sizeof(response), "{\"flash\":%s}", flashLedEnabled ? "true" : "false");
  setCommonHeaders(request);
  httpd_resp_set_type(request, "application/json");
  return httpd_resp_send(request, response, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t captureHandler(httpd_req_t* request) {
  camera_fb_t* frame = esp_camera_fb_get();
  if (!frame) {
    httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR, "Camera capture failed");
    return ESP_FAIL;
  }

  setCommonHeaders(request);
  httpd_resp_set_type(request, "image/jpeg");
  httpd_resp_set_hdr(request, "Content-Disposition", "inline; filename=sentinel-capture.jpg");
  esp_err_t result = httpd_resp_send(request, reinterpret_cast<const char*>(frame->buf), frame->len);
  esp_camera_fb_return(frame);
  return result;
}

static esp_err_t streamHandler(httpd_req_t* request) {
  esp_err_t result = httpd_resp_set_type(request, STREAM_CONTENT_TYPE);
  if (result != ESP_OK) return result;
  setCommonHeaders(request);

  char partHeader[64];
  while (true) {
    camera_fb_t* frame = esp_camera_fb_get();
    if (!frame) {
      result = ESP_FAIL;
      break;
    }

    result = httpd_resp_send_chunk(request, STREAM_SEPARATOR, strlen(STREAM_SEPARATOR));
    if (result == ESP_OK) {
      size_t headerLength = snprintf(partHeader, sizeof(partHeader), STREAM_PART, frame->len);
      result = httpd_resp_send_chunk(request, partHeader, headerLength);
    }
    if (result == ESP_OK) {
      result = httpd_resp_send_chunk(
        request,
        reinterpret_cast<const char*>(frame->buf),
        frame->len
      );
    }
    esp_camera_fb_return(frame);
    if (result != ESP_OK) break;
    delay(30);
  }
  return result;
}

static void startCameraServers() {
  httpd_config_t controlConfig = HTTPD_DEFAULT_CONFIG();
  controlConfig.server_port = 80;
  controlConfig.ctrl_port = 32768;
  controlConfig.max_uri_handlers = 6;

  httpd_uri_t rootUri = { .uri = "/", .method = HTTP_GET, .handler = rootHandler, .user_ctx = nullptr };
  httpd_uri_t statusUri = { .uri = "/status", .method = HTTP_GET, .handler = statusHandler, .user_ctx = nullptr };
  httpd_uri_t captureUri = { .uri = "/capture", .method = HTTP_GET, .handler = captureHandler, .user_ctx = nullptr };
  httpd_uri_t flashUri = { .uri = "/flash", .method = HTTP_GET, .handler = flashHandler, .user_ctx = nullptr };

  if (httpd_start(&controlServer, &controlConfig) == ESP_OK) {
    httpd_register_uri_handler(controlServer, &rootUri);
    httpd_register_uri_handler(controlServer, &statusUri);
    httpd_register_uri_handler(controlServer, &captureUri);
    httpd_register_uri_handler(controlServer, &flashUri);
  }

  httpd_config_t streamConfig = HTTPD_DEFAULT_CONFIG();
  streamConfig.server_port = 81;
  streamConfig.ctrl_port = 32769;
  httpd_uri_t streamUri = { .uri = "/stream", .method = HTTP_GET, .handler = streamHandler, .user_ctx = nullptr };
  if (httpd_start(&streamServer, &streamConfig) == ESP_OK) {
    httpd_register_uri_handler(streamServer, &streamUri);
  }
}

static bool initializeCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CAM_PIN_D0;
  config.pin_d1 = CAM_PIN_D1;
  config.pin_d2 = CAM_PIN_D2;
  config.pin_d3 = CAM_PIN_D3;
  config.pin_d4 = CAM_PIN_D4;
  config.pin_d5 = CAM_PIN_D5;
  config.pin_d6 = CAM_PIN_D6;
  config.pin_d7 = CAM_PIN_D7;
  config.pin_xclk = CAM_PIN_XCLK;
  config.pin_pclk = CAM_PIN_PCLK;
  config.pin_vsync = CAM_PIN_VSYNC;
  config.pin_href = CAM_PIN_HREF;
  config.pin_sccb_sda = CAM_PIN_SIOD;
  config.pin_sccb_scl = CAM_PIN_SIOC;
  config.pin_pwdn = CAM_PIN_PWDN;
  config.pin_reset = CAM_PIN_RESET;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA;
  config.jpeg_quality = 10;
  config.fb_count = psramFound() ? 2 : 1;
  config.grab_mode = psramFound() ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;

  esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", result);
    return false;
  }

  sensor_t* sensor = esp_camera_sensor_get();
  sensor->set_vflip(sensor, 0);
  sensor->set_hmirror(sensor, 0);
  sensor->set_brightness(sensor, 0);
  sensor->set_saturation(sensor, 0);
  return true;
}

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  if (!initializeCamera()) {
    delay(5000);
    ESP.restart();
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting ESP32-CAM to %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.printf("\nESP32-CAM IP: %s\n", WiFi.localIP().toString().c_str());

  if (MDNS.begin("sentinel-cam")) {
    MDNS.addService("http", "tcp", 80);
    Serial.println("mDNS: http://sentinel-cam.local");
  }

  startCameraServers();
  Serial.println("Capture: http://sentinel-cam.local/capture");
  Serial.println("Stream:  http://sentinel-cam.local:81/stream");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  delay(1000);
}
