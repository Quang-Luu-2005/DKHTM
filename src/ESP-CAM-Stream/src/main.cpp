#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_heap_caps.h"
#include "esp_http_server.h"
#include "esp_now.h"
#include "esp_wifi.h"
#include "img_converters.h"
#include "human_face_detect_msr01.hpp"
#include "env_config.generated.h"
#include "EspNowFaceProtocol.h"

// AI-Thinker ESP32-CAM + OV2640 pin map.
constexpr int CAM_PIN_PWDN = 32;
constexpr int CAM_PIN_RESET = -1;
constexpr int CAM_PIN_XCLK = 0;
constexpr int CAM_PIN_SIOD = 26;
constexpr int CAM_PIN_SIOC = 27;
constexpr int CAM_PIN_D7 = 35;
constexpr int CAM_PIN_D6 = 34;
constexpr int CAM_PIN_D5 = 39;
constexpr int CAM_PIN_D4 = 36;
constexpr int CAM_PIN_D3 = 21;
constexpr int CAM_PIN_D2 = 19;
constexpr int CAM_PIN_D1 = 18;
constexpr int CAM_PIN_D0 = 5;
constexpr int CAM_PIN_VSYNC = 25;
constexpr int CAM_PIN_HREF = 23;
constexpr int CAM_PIN_PCLK = 22;
constexpr int FLASH_LED_PIN = 4;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 5000;
constexpr unsigned long ESP_NOW_RETRY_INTERVAL_MS = 3000;
constexpr unsigned long FACE_DETECTION_INTERVAL_MS = 600;
constexpr unsigned long FACE_CLEAR_TIMEOUT_MS = 1500;
constexpr size_t DETECTION_BUFFER_SIZE = 320 * 240 * 3;

httpd_handle_t controlServer = nullptr;
httpd_handle_t streamServer = nullptr;
bool servicesStarted = false;
bool flashLedEnabled = false;
bool espNowReady = false;
bool faceDetected = false;
unsigned long lastWiFiRetryAt = 0;
unsigned long lastEspNowRetryAt = 0;
unsigned long lastFaceDetectionAt = 0;
unsigned long lastFaceSeenAt = 0;
uint32_t nextPresenceSequence = 1;
uint8_t *detectionBuffer = nullptr;
HumanFaceDetectMSR01 *faceDetector = nullptr;
const uint8_t BROADCAST_ADDRESS[6] = {0xff, 0xff, 0xff,
                                      0xff, 0xff, 0xff};

#define STREAM_BOUNDARY "sentinelstreamframe"
const char *STREAM_CONTENT_TYPE =
    "multipart/x-mixed-replace;boundary=" STREAM_BOUNDARY;
const char *STREAM_SEPARATOR = "\r\n--" STREAM_BOUNDARY "\r\n";
const char *STREAM_PART =
    "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

void setCommonHeaders(httpd_req_t *request) {
  httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(request, "Cache-Control",
                     "no-store, no-cache, must-revalidate");
}

void onEspNowDataSent(const uint8_t *, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("STREAM_DETECTOR|presence_delivery=FAILED");
  }
}

bool addEspNowBroadcastPeer(uint8_t channel) {
  if (esp_now_is_peer_exist(BROADCAST_ADDRESS)) return true;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BROADCAST_ADDRESS, sizeof(BROADCAST_ADDRESS));
  peer.channel = channel;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

bool setupEspNowTransport() {
  if (espNowReady) return true;
  if (WiFi.status() != WL_CONNECTED) return false;

  uint8_t primaryChannel = 0;
  wifi_second_chan_t secondaryChannel = WIFI_SECOND_CHAN_NONE;
  if (esp_wifi_get_channel(&primaryChannel, &secondaryChannel) != ESP_OK) {
    Serial.println("STREAM_DETECTOR|esp_now=NO_WIFI_CHANNEL");
    return false;
  }
  if (esp_now_init() != ESP_OK) {
    Serial.println("STREAM_DETECTOR|esp_now=INIT_FAILED");
    return false;
  }
  esp_now_register_send_cb(onEspNowDataSent);
  if (!addEspNowBroadcastPeer(primaryChannel)) {
    esp_now_deinit();
    Serial.println("STREAM_DETECTOR|esp_now=PEER_FAILED");
    return false;
  }

  espNowReady = true;
  Serial.printf("STREAM_DETECTOR|esp_now=READY|channel=%u\n", primaryChannel);
  return true;
}

bool sendFacePresence(size_t detectedFaces) {
  if (!espNowReady) return false;
  if (nextPresenceSequence == 0) nextPresenceSequence = 1;
  sentinel_now::Message message = sentinel_now::makeMessage(
      sentinel_now::MessageType::FACE_PRESENCE, nextPresenceSequence++, 0,
      millis());
  message.attempt = static_cast<uint8_t>(
      detectedFaces > UINT8_MAX ? UINT8_MAX : detectedFaces);
  sentinel_now::copyText(message.reason, sizeof(message.reason),
                         "stream_face_detected");
  return esp_now_send(BROADCAST_ADDRESS,
                      reinterpret_cast<const uint8_t *>(&message),
                      sizeof(message)) == ESP_OK;
}

void runOneStageFaceDetection() {
  if (!faceDetector || !detectionBuffer ||
      millis() - lastFaceDetectionAt < FACE_DETECTION_INTERVAL_MS) {
    return;
  }
  lastFaceDetectionAt = millis();

  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) {
    Serial.println("STREAM_DETECTOR|capture=FAILED");
    return;
  }

  const size_t requiredBytes =
      static_cast<size_t>(frame->width) * frame->height * 3;
  bool converted = requiredBytes <= DETECTION_BUFFER_SIZE &&
                   fmt2rgb888(frame->buf, frame->len, frame->format,
                              detectionBuffer);
  const int width = frame->width;
  const int height = frame->height;
  esp_camera_fb_return(frame);
  if (!converted) {
    Serial.println("STREAM_DETECTOR|conversion=FAILED");
    return;
  }

  std::list<dl::detect::result_t> &faces =
      faceDetector->infer(detectionBuffer, {height, width, 3});
  if (!faces.empty()) {
    lastFaceSeenAt = millis();
    sendFacePresence(faces.size());
    if (!faceDetected) {
      faceDetected = true;
      Serial.printf("STREAM_DETECTOR|face=DETECTED|count=%u\n",
                    static_cast<unsigned>(faces.size()));
    }
  } else if (faceDetected && millis() - lastFaceSeenAt >= FACE_CLEAR_TIMEOUT_MS) {
    faceDetected = false;
    Serial.println("STREAM_DETECTOR|face=CLEARED");
  }
}

esp_err_t rootHandler(httpd_req_t *request) {
  static const char page[] PROGMEM = R"HTML(
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sentinel Stream Camera</title>
  <style>
    body{margin:0;background:#09090b;color:#e2e8f0;font-family:system-ui;text-align:center}
    main{max-width:900px;margin:auto;padding:24px}img{max-width:100%;height:auto;border-radius:16px}
    a{color:#38bdf8}
  </style>
</head>
<body><main>
  <h2>Sentinel Stream Camera</h2>
  <p><a href="/capture">Chup JPEG</a> &middot; <a href="/status">Trang thai</a></p>
  <img id="stream" alt="ESP32-CAM stream">
  <script>
    document.getElementById('stream').src =
      'http://' + location.hostname + ':__STREAM_PORT__/stream';
  </script>
</main></body></html>)HTML";

  String html(page);
  html.replace("__STREAM_PORT__", String(CAMERA_STREAM_PORT));
  setCommonHeaders(request);
  httpd_resp_set_type(request, "text/html; charset=utf-8");
  return httpd_resp_send(request, html.c_str(), html.length());
}

esp_err_t statusHandler(httpd_req_t *request) {
  char response[256];
  snprintf(response, sizeof(response),
           "{\"online\":true,\"hostname\":\"%s.local\",\"ip\":\"%s\","
           "\"rssi\":%d,\"streamPort\":%u,\"flash\":%s,\"uptimeMs\":%lu}",
           CAMERA_HOSTNAME, WiFi.localIP().toString().c_str(), WiFi.RSSI(),
           CAMERA_STREAM_PORT, flashLedEnabled ? "true" : "false",
           static_cast<unsigned long>(millis()));
  setCommonHeaders(request);
  httpd_resp_set_type(request, "application/json");
  return httpd_resp_send(request, response, HTTPD_RESP_USE_STRLEN);
}

esp_err_t flashHandler(httpd_req_t *request) {
  char query[48] = {};
  char enabledValue[8] = {};
  if (httpd_req_get_url_query_str(request, query, sizeof(query)) != ESP_OK ||
      httpd_query_key_value(query, "enabled", enabledValue,
                            sizeof(enabledValue)) != ESP_OK) {
    httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST,
                        "Missing enabled query parameter");
    return ESP_FAIL;
  }

  if (strcmp(enabledValue, "1") == 0 || strcmp(enabledValue, "true") == 0) {
    flashLedEnabled = true;
  } else if (strcmp(enabledValue, "0") == 0 ||
             strcmp(enabledValue, "false") == 0) {
    flashLedEnabled = false;
  } else {
    httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST,
                        "enabled must be true or false");
    return ESP_FAIL;
  }

  digitalWrite(FLASH_LED_PIN, flashLedEnabled ? HIGH : LOW);
  setCommonHeaders(request);
  httpd_resp_set_type(request, "application/json");
  return httpd_resp_sendstr(request,
                            flashLedEnabled ? "{\"flash\":true}"
                                            : "{\"flash\":false}");
}

esp_err_t captureHandler(httpd_req_t *request) {
  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) {
    httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR,
                        "Camera capture failed");
    return ESP_FAIL;
  }

  setCommonHeaders(request);
  httpd_resp_set_type(request, "image/jpeg");
  httpd_resp_set_hdr(request, "Content-Disposition",
                     "inline; filename=sentinel-stream.jpg");
  const esp_err_t result = httpd_resp_send(
      request, reinterpret_cast<const char *>(frame->buf), frame->len);
  esp_camera_fb_return(frame);
  return result;
}

esp_err_t streamHandler(httpd_req_t *request) {
  esp_err_t result = httpd_resp_set_type(request, STREAM_CONTENT_TYPE);
  if (result != ESP_OK) return result;
  setCommonHeaders(request);

  char partHeader[64];
  while (true) {
    camera_fb_t *frame = esp_camera_fb_get();
    if (!frame) return ESP_FAIL;

    result = httpd_resp_send_chunk(request, STREAM_SEPARATOR,
                                   strlen(STREAM_SEPARATOR));
    if (result == ESP_OK) {
      const size_t headerLength =
          snprintf(partHeader, sizeof(partHeader), STREAM_PART, frame->len);
      result = httpd_resp_send_chunk(request, partHeader, headerLength);
    }
    if (result == ESP_OK) {
      result = httpd_resp_send_chunk(
          request, reinterpret_cast<const char *>(frame->buf), frame->len);
    }
    esp_camera_fb_return(frame);
    if (result != ESP_OK) break;
    delay(20);
  }
  return result;
}

bool initializeCamera() {
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
  config.grab_mode =
      psramFound() ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location =
      psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;

  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("STREAM_CAMERA|init=FAILED|code=0x%x\n", result);
    return false;
  }

  sensor_t *sensor = esp_camera_sensor_get();
  sensor->set_vflip(sensor, 0);
  sensor->set_hmirror(sensor, 0);
  sensor->set_brightness(sensor, 0);
  sensor->set_saturation(sensor, 0);
  Serial.println("STREAM_CAMERA|init=SUCCESS|format=JPEG|size=QVGA");
  return true;
}

bool initializeFaceDetector() {
  if (!psramFound()) {
    Serial.println("STREAM_DETECTOR|init=FAILED|reason=PSRAM_NOT_FOUND");
    return false;
  }
  detectionBuffer = static_cast<uint8_t *>(
      heap_caps_malloc(DETECTION_BUFFER_SIZE,
                       MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!detectionBuffer) {
    Serial.println("STREAM_DETECTOR|init=FAILED|reason=BUFFER_ALLOC");
    return false;
  }

  // ESP-DL MSR01 is the first-stage detector used by the two-stage pipeline.
  // This stream camera intentionally stops after this stage and delegates
  // recognition to the dedicated HFR camera.
  faceDetector = new HumanFaceDetectMSR01(0.1F, 0.5F, 10, 0.2F);
  if (!faceDetector) {
    heap_caps_free(detectionBuffer);
    detectionBuffer = nullptr;
    Serial.println("STREAM_DETECTOR|init=FAILED|reason=MODEL_ALLOC");
    return false;
  }
  Serial.println("STREAM_DETECTOR|init=SUCCESS|model=HumanFaceDetectMSR01");
  return true;
}

void startCameraServers() {
  httpd_config_t controlConfig = HTTPD_DEFAULT_CONFIG();
  controlConfig.server_port = 80;
  controlConfig.ctrl_port = 32768;
  controlConfig.max_uri_handlers = 6;

  httpd_uri_t rootUri = {.uri = "/",
                         .method = HTTP_GET,
                         .handler = rootHandler,
                         .user_ctx = nullptr};
  httpd_uri_t statusUri = {.uri = "/status",
                           .method = HTTP_GET,
                           .handler = statusHandler,
                           .user_ctx = nullptr};
  httpd_uri_t captureUri = {.uri = "/capture",
                            .method = HTTP_GET,
                            .handler = captureHandler,
                            .user_ctx = nullptr};
  httpd_uri_t flashUri = {.uri = "/flash",
                          .method = HTTP_GET,
                          .handler = flashHandler,
                          .user_ctx = nullptr};

  if (httpd_start(&controlServer, &controlConfig) == ESP_OK) {
    httpd_register_uri_handler(controlServer, &rootUri);
    httpd_register_uri_handler(controlServer, &statusUri);
    httpd_register_uri_handler(controlServer, &captureUri);
    httpd_register_uri_handler(controlServer, &flashUri);
  } else {
    Serial.println("STREAM_CAMERA|control_server=FAILED");
  }

  httpd_config_t streamConfig = HTTPD_DEFAULT_CONFIG();
  streamConfig.server_port = CAMERA_STREAM_PORT;
  streamConfig.ctrl_port = 32769;
  streamConfig.stack_size = 8192;

  httpd_uri_t streamUri = {.uri = "/stream",
                           .method = HTTP_GET,
                           .handler = streamHandler,
                           .user_ctx = nullptr};
  if (httpd_start(&streamServer, &streamConfig) == ESP_OK) {
    httpd_register_uri_handler(streamServer, &streamUri);
  } else {
    Serial.println("STREAM_CAMERA|stream_server=FAILED");
  }
}

void startNetworkServices() {
  if (servicesStarted || WiFi.status() != WL_CONNECTED) return;

  if (MDNS.begin(CAMERA_HOSTNAME)) {
    MDNS.addService("http", "tcp", 80);
    MDNS.addService("http", "tcp", CAMERA_STREAM_PORT);
  }
  startCameraServers();
  servicesStarted = true;

  const String ip = WiFi.localIP().toString();
  Serial.printf("STREAM_CAMERA|ready=1|ip=%s|rssi=%d\n", ip.c_str(),
                WiFi.RSSI());
  Serial.printf("STREAM_CAMERA|page=http://%s.local/\n", CAMERA_HOSTNAME);
  Serial.printf("STREAM_CAMERA|stream=http://%s:%u/stream\n", ip.c_str(),
                CAMERA_STREAM_PORT);
}

void beginWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setHostname(CAMERA_HOSTNAME);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("STREAM_CAMERA|wifi=CONNECTING|host=%s\n", CAMERA_HOSTNAME);
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println("ESP_CAM_STREAN|BOOT");
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  if (!initializeCamera()) {
    delay(3000);
    ESP.restart();
  }
  if (!initializeFaceDetector()) {
    delay(3000);
    ESP.restart();
  }
  beginWiFi();
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    startNetworkServices();
    if (!espNowReady &&
        millis() - lastEspNowRetryAt >= ESP_NOW_RETRY_INTERVAL_MS) {
      lastEspNowRetryAt = millis();
      setupEspNowTransport();
    }
    runOneStageFaceDetection();
  } else if (millis() - lastWiFiRetryAt >= WIFI_RETRY_INTERVAL_MS) {
    if (espNowReady) {
      esp_now_deinit();
      espNowReady = false;
    }
    lastWiFiRetryAt = millis();
    Serial.println("STREAM_CAMERA|wifi=RETRY");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  delay(30);
}
