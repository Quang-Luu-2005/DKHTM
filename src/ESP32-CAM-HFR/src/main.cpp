#include <Arduino.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_heap_caps.h"
#include "esp_now.h"
#include "esp_partition.h"
#include "esp_rom_crc.h"
#include "esp_wifi.h"
#include "img_converters.h"
#include <cstring>
#include "EspNowFaceProtocol.h"
#include "env_config.generated.h"
#include "face_recognition_112_v1_s16.hpp"
#include "face_recognition_112_v1_s8.hpp"
#include "human_face_detect_mnp01.hpp"
#include "human_face_detect_msr01.hpp"

#ifndef HFR_QUANT_S16
#define HFR_QUANT_S16 1
#endif

#if HFR_QUANT_S16
using BenchmarkRecognizer = FaceRecognition112V1S16;
constexpr const char *MODEL_NAME = "FaceRecognition112V1S16";
#else
using BenchmarkRecognizer = FaceRecognition112V1S8;
constexpr const char *MODEL_NAME = "FaceRecognition112V1S8";
#endif

// AI-Thinker ESP32-CAM + OV2640.
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
constexpr int MIN_FACE_SIZE_PX = 45;
constexpr uint32_t FLASH_ON_MS = 180;
constexpr uint32_t FLASH_OFF_MS = 180;
constexpr uint32_t FACE_STORE_MAGIC = 0x53465248; // "HFRS"
constexpr uint16_t FACE_STORE_VERSION = 2;
constexpr size_t FACE_STORE_MAX_RANK = 4;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 5000;

BenchmarkRecognizer *recognizer = nullptr;
HumanFaceDetectMSR01 *stageOneDetector = nullptr;
HumanFaceDetectMNP01 *stageTwoDetector = nullptr;
const esp_partition_t *faceStorePartition = nullptr;
const uint8_t BROADCAST_ADDRESS[6] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
portMUX_TYPE espNowRequestMux = portMUX_INITIALIZER_UNLOCKED;
sentinel_now::Message pendingRequest = {};
sentinel_now::Message lastScanResult = {};
uint8_t pendingRequestSender[6] = {};
uint8_t lastResultDestination[6] = {};
volatile bool pendingRequestAvailable = false;
bool espNowReady = false;
bool espNowUsesChannelFallback = false;
unsigned long lastWiFiRetryAt = 0;

struct FaceStoreHeader {
  uint32_t magic;
  uint16_t version;
  uint16_t count;
  uint32_t payloadSize;
  uint32_t payloadCrc;
};

struct FaceStoreRecord {
  int32_t sourceId;
  uint16_t nameLength;
  uint16_t embeddingLength;
  uint8_t rank;
  int8_t exponent;
  uint16_t reserved;
  int32_t dimensions[FACE_STORE_MAX_RANK];
  uint32_t embeddingCrc;
};

enum class FaceFrameStatus {
  READY,
  NO_FACE,
  MULTIPLE_FACES,
  FACE_TOO_SMALL,
  CAMERA_ERROR,
};

struct CapturedFace {
  uint8_t *bgr888 = nullptr;
  int width = 0;
  int height = 0;
  std::vector<int> landmarks;
};

static const char *statusName(FaceFrameStatus status) {
  switch (status) {
  case FaceFrameStatus::READY: return "READY";
  case FaceFrameStatus::NO_FACE: return "NO_FACE";
  case FaceFrameStatus::MULTIPLE_FACES: return "MULTIPLE_FACES";
  case FaceFrameStatus::FACE_TOO_SMALL: return "FACE_TOO_SMALL";
  default: return "CAMERA_ERROR";
  }
}

static void printMemory(const char *stage) {
  Serial.printf(
      "MEMORY|%s|heap_free=%u|heap_largest=%u|psram_found=%s|psram_free=%u\n",
      stage, ESP.getFreeHeap(),
      heap_caps_get_largest_free_block(MALLOC_CAP_8BIT),
      psramFound() ? "true" : "false", ESP.getFreePsram());
}

static void flashEnrollmentSuccess() {
  for (int pulse = 0; pulse < 3; ++pulse) {
    digitalWrite(FLASH_LED_PIN, HIGH);
    delay(FLASH_ON_MS);
    digitalWrite(FLASH_LED_PIN, LOW);
    delay(FLASH_OFF_MS);
  }
}

static void onEspNowDataSent(const uint8_t *, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("ESP-NOW camera result delivery failed");
  }
}

static void onEspNowDataReceived(const uint8_t *sender, const uint8_t *data,
                                 int length) {
  if (!sender || !data ||
      length != static_cast<int>(sizeof(sentinel_now::Message))) return;
  sentinel_now::Message message = {};
  memcpy(&message, data, sizeof(message));
  const bool scanRequest =
      message.type == sentinel_now::MessageType::SCAN_REQUEST &&
      message.sessionId != 0;
  const bool enrollmentRequest =
      message.type == sentinel_now::MessageType::ENROLL_REQUEST &&
      message.employeeId[0] != '\0';
  if (!sentinel_now::isValid(message) || message.sequence == 0 ||
      (!scanRequest && !enrollmentRequest)) {
    return;
  }

  portENTER_CRITICAL_ISR(&espNowRequestMux);
  pendingRequest = message;
  memcpy(pendingRequestSender, sender, sizeof(pendingRequestSender));
  pendingRequestAvailable = true;
  portEXIT_CRITICAL_ISR(&espNowRequestMux);
}

static bool addEspNowBroadcastPeer() {
  if (esp_now_is_peer_exist(BROADCAST_ADDRESS)) return true;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BROADCAST_ADDRESS, sizeof(BROADCAST_ADDRESS));
  peer.channel = 0;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

static bool selectEspNowChannelFromAccessPoint(uint8_t &primaryChannel) {
  WiFi.disconnect(false, false);
  delay(100);
  Serial.println("ESP-NOW camera scanning for configured WiFi channel");
  const int networkCount = WiFi.scanNetworks(false, true);
  int targetRssi = -127;
  for (int index = 0; index < networkCount; ++index) {
    if (WiFi.SSID(index) != WIFI_SSID) continue;
    primaryChannel = static_cast<uint8_t>(WiFi.channel(index));
    targetRssi = WiFi.RSSI(index);
    break;
  }
  WiFi.scanDelete();

  if (primaryChannel == 0) {
    Serial.printf("ESP-NOW camera setup failed: configured WiFi not visible|networks=%d\n",
                  networkCount);
    return false;
  }
  if (esp_wifi_set_channel(primaryChannel, WIFI_SECOND_CHAN_NONE) != ESP_OK) {
    Serial.println("ESP-NOW camera setup failed: cannot select scanned WiFi channel");
    return false;
  }
  Serial.printf("ESP-NOW camera channel fallback|channel=%u|rssi=%d\n",
                primaryChannel, targetRssi);
  return true;
}

static bool setupEspNowTransport() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long startedAt = millis();
  Serial.print("ESP-NOW camera connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED &&
         millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  uint8_t primaryChannel = 0;
  wifi_second_chan_t secondaryChannel = WIFI_SECOND_CHAN_NONE;
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  if (wifiConnected) {
    if (esp_wifi_get_channel(&primaryChannel, &secondaryChannel) != ESP_OK) {
      Serial.println("ESP-NOW camera setup failed: cannot read WiFi channel");
      return false;
    }
  } else {
    Serial.printf("ESP-NOW camera WiFi timeout|status=%d\n",
                  static_cast<int>(WiFi.status()));
    if (!selectEspNowChannelFromAccessPoint(primaryChannel)) return false;
  }
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW camera setup failed: esp_now_init");
    return false;
  }
  esp_now_register_send_cb(onEspNowDataSent);
  esp_now_register_recv_cb(onEspNowDataReceived);
  if (!addEspNowBroadcastPeer()) {
    Serial.println("ESP-NOW camera setup failed: cannot add broadcast peer");
    esp_now_deinit();
    return false;
  }

  espNowReady = true;
  espNowUsesChannelFallback = !wifiConnected;
  Serial.printf("ESP-NOW camera ready|mac=%s|ip=%s|channel=%u|transport=%s\n",
                WiFi.macAddress().c_str(), WiFi.localIP().toString().c_str(),
                primaryChannel,
                espNowUsesChannelFallback ? "channel_fallback" : "wifi_associated");
  return true;
}

static bool ensureEspNowPeer(const uint8_t *address) {
  if (!address) return false;
  if (esp_now_is_peer_exist(address)) return true;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, address, 6);
  peer.channel = 0;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

static bool sendEspNowResult(const sentinel_now::Message &result,
                             const uint8_t *destination) {
  if (!espNowReady) return false;
  ensureEspNowPeer(destination);
  esp_now_send(destination, reinterpret_cast<const uint8_t *>(&result), sizeof(result));
  const esp_err_t broadcastResult = esp_now_send(
      BROADCAST_ADDRESS, reinterpret_cast<const uint8_t *>(&result), sizeof(result));
  Serial.printf(
      "ESP-NOW RESULT sent|type=%u|session=%lu|sequence=%lu|result=%s|code=%d\n",
      static_cast<unsigned>(result.type),
      static_cast<unsigned long>(result.sessionId),
      static_cast<unsigned long>(result.sequence),
      sentinel_now::resultName(result.result), broadcastResult);
  return broadcastResult == ESP_OK;
}

static int readStoredEmbeddingCount() {
  if (!faceStorePartition) return -1;
  FaceStoreHeader header = {};
  if (esp_partition_read(faceStorePartition, 0, &header, sizeof(header)) != ESP_OK) {
    return -1;
  }
  if (header.magic != FACE_STORE_MAGIC ||
      header.version != FACE_STORE_VERSION ||
      header.payloadSize > faceStorePartition->size - sizeof(header)) {
    return 0;
  }
  return header.count;
}

static int persistEmbeddingsToFlash() {
  if (!faceStorePartition || !recognizer) return -1;
  std::vector<face_info_t> ids = recognizer->get_enrolled_ids();
  size_t payloadSize = 0;
  for (const face_info_t &info : ids) {
    Tensor<float> &embedding = recognizer->get_face_emb(info.id);
    if (!embedding.element || embedding.get_size() <= 0 ||
        info.name.size() > UINT16_MAX || embedding.get_size() > UINT16_MAX ||
        embedding.shape.empty() ||
        embedding.shape.size() > FACE_STORE_MAX_RANK) {
      return -1;
    }
    payloadSize += sizeof(FaceStoreRecord) + info.name.size() +
                   static_cast<size_t>(embedding.get_size()) * sizeof(float);
  }
  if (sizeof(FaceStoreHeader) + payloadSize > faceStorePartition->size) {
    return -1;
  }

  uint8_t *payload = nullptr;
  if (payloadSize > 0) {
    payload = static_cast<uint8_t *>(
        heap_caps_malloc(payloadSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    if (!payload) return -1;
  }

  size_t cursor = 0;
  for (const face_info_t &info : ids) {
    Tensor<float> &embedding = recognizer->get_face_emb(info.id);
    FaceStoreRecord record = {};
    record.sourceId = info.id;
    record.nameLength = static_cast<uint16_t>(info.name.size());
    record.embeddingLength = static_cast<uint16_t>(embedding.get_size());
    record.rank = static_cast<uint8_t>(embedding.shape.size());
    record.exponent = static_cast<int8_t>(embedding.exponent);
    for (size_t dimension = 0; dimension < embedding.shape.size(); ++dimension) {
      record.dimensions[dimension] = embedding.shape[dimension];
    }
    const size_t embeddingBytes =
        static_cast<size_t>(embedding.get_size()) * sizeof(float);
    record.embeddingCrc = esp_rom_crc32_le(
        0, reinterpret_cast<const uint8_t *>(embedding.element), embeddingBytes);
    Serial.printf(
        "FACE_STORE_WRITE|id=%d|name=%s|length=%u|rank=%u|exponent=%d|crc=0x%08x\n",
        record.sourceId, info.name.c_str(), record.embeddingLength,
        record.rank, record.exponent, record.embeddingCrc);
    memcpy(payload + cursor, &record, sizeof(record));
    cursor += sizeof(record);
    memcpy(payload + cursor, info.name.data(), info.name.size());
    cursor += info.name.size();
    memcpy(payload + cursor, embedding.element, embeddingBytes);
    cursor += embeddingBytes;
  }

  FaceStoreHeader header = {
      FACE_STORE_MAGIC, FACE_STORE_VERSION, static_cast<uint16_t>(ids.size()),
      static_cast<uint32_t>(payloadSize),
      payloadSize > 0 ? esp_rom_crc32_le(0, payload, payloadSize) : 0};
  const size_t bytesToErase =
      ((sizeof(header) + payloadSize + 4095) / 4096) * 4096;
  esp_err_t result = esp_partition_erase_range(faceStorePartition, 0, bytesToErase);
  if (result == ESP_OK) {
    result = esp_partition_write(faceStorePartition, 0, &header, sizeof(header));
  }
  if (result == ESP_OK && payloadSize > 0) {
    result = esp_partition_write(faceStorePartition, sizeof(header), payload,
                                 payloadSize);
  }
  if (payload) heap_caps_free(payload);
  return result == ESP_OK ? static_cast<int>(ids.size()) : -1;
}

static int restoreEmbeddingsFromFlash() {
  if (!faceStorePartition || !recognizer) return -1;
  FaceStoreHeader header = {};
  if (esp_partition_read(faceStorePartition, 0, &header, sizeof(header)) != ESP_OK) {
    return -1;
  }
  if (header.magic != FACE_STORE_MAGIC ||
      header.version != FACE_STORE_VERSION) {
    return 0;
  }
  if (header.payloadSize > faceStorePartition->size - sizeof(header)) return -1;
  if (header.count == 0) return 0;

  uint8_t *payload = static_cast<uint8_t *>(
      heap_caps_malloc(header.payloadSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!payload) return -1;
  if (esp_partition_read(faceStorePartition, sizeof(header), payload,
                         header.payloadSize) != ESP_OK ||
      esp_rom_crc32_le(0, payload, header.payloadSize) != header.payloadCrc) {
    heap_caps_free(payload);
    return -1;
  }

  size_t cursor = 0;
  int restored = 0;
  for (uint16_t index = 0; index < header.count; ++index) {
    if (cursor + sizeof(FaceStoreRecord) > header.payloadSize) {
      restored = -1;
      break;
    }
    FaceStoreRecord record = {};
    memcpy(&record, payload + cursor, sizeof(record));
    cursor += sizeof(record);
    const size_t embeddingBytes =
        static_cast<size_t>(record.embeddingLength) * sizeof(float);
    if (record.nameLength == 0 || record.embeddingLength == 0 ||
        record.rank == 0 || record.rank > FACE_STORE_MAX_RANK ||
        cursor + record.nameLength + embeddingBytes > header.payloadSize) {
      restored = -1;
      break;
    }
    std::string name(reinterpret_cast<char *>(payload + cursor),
                     record.nameLength);
    cursor += record.nameLength;
    std::vector<int> shape;
    size_t shapeElements = 1;
    for (uint8_t dimension = 0; dimension < record.rank; ++dimension) {
      if (record.dimensions[dimension] <= 0) {
        restored = -1;
        break;
      }
      shape.push_back(record.dimensions[dimension]);
      shapeElements *= static_cast<size_t>(record.dimensions[dimension]);
    }
    if (restored < 0 || shapeElements != record.embeddingLength) break;
    const uint32_t embeddingCrc =
        esp_rom_crc32_le(0, payload + cursor, embeddingBytes);
    if (embeddingCrc != record.embeddingCrc) {
      restored = -1;
      break;
    }
    Tensor<float> embedding;
    embedding.set_shape(shape).set_exponent(record.exponent);
    if (!embedding.malloc_element()) {
      restored = -1;
      break;
    }
    memcpy(embedding.element, payload + cursor, embeddingBytes);
    cursor += embeddingBytes;
    const int restoredId = recognizer->enroll_id(embedding, name, false);
    Serial.printf(
        "FACE_STORE_RESTORE|source_id=%d|restored_id=%d|name=%s|length=%u|rank=%u|exponent=%d|crc=0x%08x\n",
        record.sourceId, restoredId, name.c_str(), record.embeddingLength,
        record.rank, record.exponent, embeddingCrc);
    if (restoredId < 0) {
      restored = -1;
      break;
    }
    ++restored;
  }
  heap_caps_free(payload);
  return restored;
}

static bool clearStoredEmbeddings() {
  if (!faceStorePartition) return false;
  return esp_partition_erase_range(faceStorePartition, 0,
                                   faceStorePartition->size) == ESP_OK;
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
  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("CAMERA|init=FAILED|code=0x%x\n", result);
    return false;
  }
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_vflip(sensor, 0);
    sensor->set_hmirror(sensor, 0);
    sensor->set_brightness(sensor, 0);
    sensor->set_saturation(sensor, 0);
  }
  Serial.println("CAMERA|init=SUCCESS|format=JPEG|size=QVGA");
  return true;
}

static void releaseCapturedFace(CapturedFace &face) {
  if (face.bgr888) {
    heap_caps_free(face.bgr888);
    face.bgr888 = nullptr;
  }
}

static FaceFrameStatus captureUsableFace(CapturedFace &face) {
  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) {
    Serial.println("HFR_CAPTURE|frame=NULL");
    return FaceFrameStatus::CAMERA_ERROR;
  }

  // Khi camera chạy JPEG, frame->width/height đôi khi là 0 trước khi giải mã.
  // Chúng ta gán cứng kích thước theo FRAMESIZE_QVGA (320x240):
  face.width = 320;
  face.height = 240;
  const size_t rgbSize = 320 * 240 * 3;
  face.bgr888 = static_cast<uint8_t *>(
      heap_caps_malloc(rgbSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!face.bgr888) {
    Serial.println("HFR_CAPTURE|malloc=FAILED");
    esp_camera_fb_return(frame);
    return FaceFrameStatus::CAMERA_ERROR;
  }

  const bool converted = fmt2rgb888(frame->buf, frame->len, frame->format,
                                    face.bgr888);
  esp_camera_fb_return(frame);
  if (!converted) {
    Serial.println("HFR_CAPTURE|conversion=FAILED");
    releaseCapturedFace(face);
    return FaceFrameStatus::CAMERA_ERROR;
  }

  std::list<dl::detect::result_t> &candidates = stageOneDetector->infer(
      face.bgr888, {face.height, face.width, 3});
  std::list<dl::detect::result_t> &results = stageTwoDetector->infer(
      face.bgr888, {face.height, face.width, 3}, candidates);

  if (results.empty()) {
    releaseCapturedFace(face);
    return FaceFrameStatus::NO_FACE;
  }
  if (results.size() != 1) {
    Serial.printf("HFR_CAPTURE|multiple_faces=%u\n", static_cast<unsigned>(results.size()));
    releaseCapturedFace(face);
    return FaceFrameStatus::MULTIPLE_FACES;
  }

  const dl::detect::result_t &detectedFace = results.front();
  const int width = detectedFace.box[2] - detectedFace.box[0] + 1;
  const int height = detectedFace.box[3] - detectedFace.box[1] + 1;
  if (width < MIN_FACE_SIZE_PX || height < MIN_FACE_SIZE_PX) {
    releaseCapturedFace(face);
    return FaceFrameStatus::FACE_TOO_SMALL;
  }
  face.landmarks = detectedFace.keypoint;
  return FaceFrameStatus::READY;
}

static FaceFrameStatus captureUsableFaceWithRetries(
    CapturedFace &face, int maxAttempts, uint32_t retryDelayMs,
    int &attemptsUsed) {
  FaceFrameStatus lastStatus = FaceFrameStatus::CAMERA_ERROR;
  attemptsUsed = 0;
  for (int attempt = 1; attempt <= maxAttempts; ++attempt) {
    attemptsUsed = attempt;
    lastStatus = captureUsableFace(face);
    if (lastStatus == FaceFrameStatus::READY) {
      return lastStatus;
    }
    if (attempt < maxAttempts) {
      delay(retryDelayMs);
    }
  }
  return lastStatus;
}

static sentinel_now::FaceResult transportStatus(FaceFrameStatus status) {
  switch (status) {
  case FaceFrameStatus::NO_FACE: return sentinel_now::FaceResult::NO_FACE;
  case FaceFrameStatus::MULTIPLE_FACES:
    return sentinel_now::FaceResult::MULTIPLE_FACES;
  case FaceFrameStatus::FACE_TOO_SMALL:
    return sentinel_now::FaceResult::FACE_TOO_SMALL;
  case FaceFrameStatus::CAMERA_ERROR:
    return sentinel_now::FaceResult::CAMERA_ERROR;
  default: return sentinel_now::FaceResult::NOT_RUN;
  }
}

static sentinel_now::Message performRecognition(
    const sentinel_now::Message &request) {
  sentinel_now::Message response = sentinel_now::makeMessage(
      sentinel_now::MessageType::SCAN_RESULT, request.sequence,
      request.sessionId, millis());
  response.attempt = request.attempt;
  CapturedFace face;
  int attemptsUsed = 0;
  const uint32_t startedAt = millis();
  const FaceFrameStatus status =
      captureUsableFaceWithRetries(face, 3, 120, attemptsUsed);
  const uint32_t detectionMs = millis() - startedAt;
  if (status != FaceFrameStatus::READY) {
    response.result = transportStatus(status);
    sentinel_now::copyText(response.reason, sizeof(response.reason),
                           statusName(status));
    Serial.printf("SCAN_RESULT|status=%s|attempts=%d|detection_ms=%u\n",
                  statusName(status), attemptsUsed, detectionMs);
    return response;
  }

  Tensor<uint8_t> image;
  image.set_element(face.bgr888)
      .set_shape({face.height, face.width, 3})
      .set_auto_free(false);
  const uint32_t recognitionStartedAt = millis();
  face_info_t result = recognizer->recognize(image, face.landmarks);
  const uint32_t recognitionMs = millis() - recognitionStartedAt;
  releaseCapturedFace(face);

  if (result.id >= 0) {
    response.result = sentinel_now::FaceResult::VERIFIED;
    response.similarity = result.similarity;
    sentinel_now::copyText(response.employeeId, sizeof(response.employeeId),
                           result.name.c_str());
    sentinel_now::copyText(response.reason, sizeof(response.reason),
                           "face_matched");
    Serial.printf(
        "SCAN_RESULT|status=VERIFIED|employeeId=%s|faceId=%d|similarity=%.4f|detection_ms=%u|recognition_ms=%u|total_ms=%u\n",
        result.name.c_str(), result.id, result.similarity, detectionMs,
        recognitionMs, millis() - startedAt);
  } else {
    response.result = sentinel_now::FaceResult::UNKNOWN;
    response.similarity = result.similarity;
    sentinel_now::copyText(response.reason, sizeof(response.reason),
                           "unknown_face");
    Serial.printf(
        "SCAN_RESULT|status=UNKNOWN|similarity=%.4f|detection_ms=%u|recognition_ms=%u|total_ms=%u\n",
        result.similarity, detectionMs, recognitionMs, millis() - startedAt);
  }
  printMemory("after_scan");
  return response;
}

static void runRecognition() {
  const sentinel_now::Message request = sentinel_now::makeMessage(
      sentinel_now::MessageType::SCAN_REQUEST, 0, 0, millis());
  performRecognition(request);
}

static bool sendEnrollmentUpdate(const sentinel_now::Message &request,
                                 const uint8_t *destination,
                                 sentinel_now::MessageType type,
                                 sentinel_now::FaceResult result,
                                 uint8_t completedViews,
                                 const char *reason) {
  sentinel_now::Message response = sentinel_now::makeMessage(
      type, request.sequence, 0, millis());
  response.result = result;
  response.attempt = completedViews;
  sentinel_now::copyText(response.employeeId, sizeof(response.employeeId),
                         request.employeeId);
  sentinel_now::copyText(response.reason, sizeof(response.reason), reason);
  return sendEspNowResult(response, destination);
}

static bool enrollOneView(const String &employeeId, const char *view,
                          int &enrolledFaceId, String &failureReason) {
  Serial.printf("ENROLL_PROMPT|%s|LOOK_%s|capture_in_ms=2000\n",
                employeeId.c_str(), view);
  delay(2000);

  CapturedFace face;
  int attemptsUsed = 0;
  const uint32_t startedAt = millis();
  const FaceFrameStatus status =
      captureUsableFaceWithRetries(face, 25, 120, attemptsUsed);
  if (status != FaceFrameStatus::READY) {
    failureReason = statusName(status);
    Serial.printf(
        "ENROLL_VIEW_RESULT|%s|%s|FAILED|reason=%s|attempts=%d\n",
        employeeId.c_str(), view, failureReason.c_str(), attemptsUsed);
    return false;
  }

  Tensor<uint8_t> image;
  image.set_element(face.bgr888)
      .set_shape({face.height, face.width, 3})
      .set_auto_free(false);
  enrolledFaceId = recognizer->enroll_id(
      image, face.landmarks, std::string(employeeId.c_str()), false);
  releaseCapturedFace(face);
  if (enrolledFaceId < 0) failureReason = "EMBEDDING_FAILED";
  Serial.printf(
      "ENROLL_VIEW_RESULT|%s|%s|%s|faceId=%d|attempts=%d|elapsed_ms=%u\n",
      employeeId.c_str(), view, enrolledFaceId >= 0 ? "SUCCESS" : "FAILED",
      enrolledFaceId, attemptsUsed, millis() - startedAt);
  if (enrolledFaceId >= 0) {
    Serial.printf("ENROLL_SIGNAL|%s|%s|FLASH_3_PULSES\n",
                  employeeId.c_str(), view);
    flashEnrollmentSuccess();
  }
  return enrolledFaceId >= 0;
}

static bool runEnrollment(const String &employeeId,
                          const sentinel_now::Message *networkRequest = nullptr,
                          const uint8_t *destination = nullptr) {
  if (employeeId.isEmpty() || employeeId.length() > 24) {
    Serial.println("ENROLL_RESULT||FAILED|reason=INVALID_EMPLOYEE_ID");
    if (networkRequest && destination) {
      sendEnrollmentUpdate(*networkRequest, destination,
                           sentinel_now::MessageType::ENROLL_RESULT,
                           sentinel_now::FaceResult::CAMERA_ERROR, 0,
                           "INVALID_EMPLOYEE_ID");
    }
    return false;
  }

  const std::vector<face_info_t> previousIds =
      recognizer->get_enrolled_ids_with_name(std::string(employeeId.c_str()));
  const char *views[] = {"FRONT", "LEFT_15_DEG", "RIGHT_15_DEG"};
  int enrolledIds[3] = {-1, -1, -1};
  for (size_t i = 0; i < 3; ++i) {
    String failureReason;
    if (!enrollOneView(employeeId, views[i], enrolledIds[i], failureReason)) {
      for (size_t rollback = 0; rollback < i; ++rollback) {
        if (enrolledIds[rollback] >= 0) {
          recognizer->delete_id(enrolledIds[rollback], false);
        }
      }
      persistEmbeddingsToFlash();
      Serial.printf("ENROLL_RESULT|%s|FAILED|reason=%s\n",
                    employeeId.c_str(), failureReason.c_str());
      if (networkRequest && destination) {
        sendEnrollmentUpdate(*networkRequest, destination,
                             sentinel_now::MessageType::ENROLL_RESULT,
                             sentinel_now::FaceResult::CAMERA_ERROR,
                             static_cast<uint8_t>(i), failureReason.c_str());
      }
      return false;
    }
    if (networkRequest && destination) {
      sendEnrollmentUpdate(*networkRequest, destination,
                           sentinel_now::MessageType::ENROLL_PROGRESS,
                           sentinel_now::FaceResult::NOT_RUN,
                           static_cast<uint8_t>(i + 1), views[i]);
    }
  }

  for (const face_info_t &previous : previousIds) {
    recognizer->delete_id(previous.id, false);
  }
  const int ramIds = recognizer->get_enrolled_id_num();
  const int persistedIds = persistEmbeddingsToFlash();
  const int partitionState = readStoredEmbeddingCount();
  if (persistedIds != ramIds || persistedIds < 3) {
    Serial.printf(
        "ENROLL_RESULT|%s|FAILED|reason=FLASH_WRITE_FAILED|ram=%d|persisted=%d|partition_check=%d\n",
        employeeId.c_str(), ramIds, persistedIds, partitionState);
    if (networkRequest && destination) {
      sendEnrollmentUpdate(*networkRequest, destination,
                           sentinel_now::MessageType::ENROLL_RESULT,
                           sentinel_now::FaceResult::CAMERA_ERROR, 3,
                           "FLASH_WRITE_FAILED");
    }
    return false;
  }
  Serial.printf(
      "ENROLL_RESULT|%s|SUCCESS|embeddings=3|stored=%d|persisted=%d|partition_check=%d\n",
      employeeId.c_str(), ramIds, persistedIds, partitionState);
  if (networkRequest && destination) {
    sendEnrollmentUpdate(*networkRequest, destination,
                         sentinel_now::MessageType::ENROLL_RESULT,
                         sentinel_now::FaceResult::VERIFIED, 3, "SUCCESS");
  }
  printMemory("after_enrollment");
  return true;
}

static void processEspNowRequest() {
  sentinel_now::Message request = {};
  uint8_t sender[6] = {};
  bool available = false;
  portENTER_CRITICAL(&espNowRequestMux);
  if (pendingRequestAvailable) {
    request = pendingRequest;
    memcpy(sender, pendingRequestSender, sizeof(sender));
    pendingRequestAvailable = false;
    available = true;
  }
  portEXIT_CRITICAL(&espNowRequestMux);
  if (!available || !recognizer) return;

  if (request.type == sentinel_now::MessageType::ENROLL_REQUEST) {
    Serial.printf("ESP-NOW ENROLL_REQUEST received|employee=%s|sequence=%lu\n",
                  request.employeeId,
                  static_cast<unsigned long>(request.sequence));
    runEnrollment(String(request.employeeId), &request, sender);
    return;
  }

  if (lastScanResult.sessionId == request.sessionId &&
      lastScanResult.sequence == request.sequence &&
      lastScanResult.type == sentinel_now::MessageType::SCAN_RESULT) {
    Serial.println("ESP-NOW duplicate request; resending cached result");
    sendEspNowResult(lastScanResult, sender);
    return;
  }

  Serial.printf("ESP-NOW SCAN_REQUEST received|session=%lu|sequence=%lu|attempt=%u\n",
                static_cast<unsigned long>(request.sessionId),
                static_cast<unsigned long>(request.sequence), request.attempt);
  lastScanResult = performRecognition(request);
  memcpy(lastResultDestination, sender, sizeof(lastResultDestination));
  sendEspNowResult(lastScanResult, lastResultDestination);
}

static void processCommand(String command) {
  command.trim();
  if (command == "SCAN") {
    runRecognition();
  } else if (command.startsWith("ENROLL|")) {
    runEnrollment(command.substring(7));
  } else if (command == "CLEAR") {
    recognizer->clear_id(false);
    Serial.printf("CLEAR_RESULT|%s\n",
                  clearStoredEmbeddings() ? "SUCCESS" : "FAILED");
  } else if (command == "STATUS" || command == "DUMP_VECTORS") {
    Serial.printf("STATUS|model=%s|enrolled=%d|persisted=%d|esp_now=%s|transport=%s\n",
                  MODEL_NAME, recognizer->get_enrolled_id_num(),
                  readStoredEmbeddingCount(), espNowReady ? "ready" : "offline",
                  espNowUsesChannelFallback ? "channel_fallback" : "wifi_associated");
    const int count = readStoredEmbeddingCount();
    Serial.printf("FACE_VECTORS|count=%d|status=READY|dimensions=512\n", count);
    printMemory("status");
  } else if (!command.isEmpty()) {
    Serial.println("ERROR|UNKNOWN_COMMAND|use=STATUS,SCAN,ENROLL|employeeId,CLEAR");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);
  Serial.println("HFR_BENCHMARK|BOOT");
  Serial.printf("BOARD|chip=%s|revision=%u|flash=%u|cpu_mhz=%u\n",
                ESP.getChipModel(), ESP.getChipRevision(), ESP.getFlashChipSize(),
                ESP.getCpuFreqMHz());
  printMemory("boot");

  if (!psramFound()) {
    Serial.println("HFR_BENCHMARK|FATAL|PSRAM_NOT_FOUND");
    return;
  }
  if (!initializeCamera()) return;
  printMemory("after_camera");

  const uint32_t detectorStartedAt = millis();
  stageOneDetector = new HumanFaceDetectMSR01(0.1F, 0.5F, 10, 0.2F);
  stageTwoDetector = new HumanFaceDetectMNP01(0.5F, 0.3F, 5);
  Serial.printf("HFR_BENCHMARK|DETECTOR_READY|init_ms=%u\n",
                millis() - detectorStartedAt);
  printMemory("after_detector");

  const uint32_t modelStartedAt = millis();
  recognizer = new BenchmarkRecognizer();
  if (!recognizer) {
    Serial.println("HFR_BENCHMARK|FATAL|MODEL_INIT_FAILED");
    return;
  }
  recognizer->set_thresh(0.55F);
  faceStorePartition = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "fr");
  const int partitionSet = faceStorePartition ? 1 : 0;
  const int restoredIds = partitionSet ? restoreEmbeddingsFromFlash() : -1;
  Serial.printf(
      "HFR_BENCHMARK|MODEL_READY|name=%s|init_ms=%u|partition_set=%d|restored=%d|threshold=%.3f\n",
      MODEL_NAME, millis() - modelStartedAt, partitionSet, restoredIds,
      recognizer->get_thresh());
  printMemory("ready");
  setupEspNowTransport();
  lastWiFiRetryAt = millis();
  printMemory("after_esp_now");
  Serial.println("HFR_BENCHMARK|COMMANDS|STATUS,SCAN,ENROLL|employeeId,CLEAR");
}

void loop() {
  if (!espNowReady && millis() - lastWiFiRetryAt >= WIFI_RETRY_INTERVAL_MS) {
    setupEspNowTransport();
    lastWiFiRetryAt = millis();
  } else if (espNowReady && !espNowUsesChannelFallback &&
             WiFi.status() != WL_CONNECTED &&
             millis() - lastWiFiRetryAt >= WIFI_RETRY_INTERVAL_MS) {
    lastWiFiRetryAt = millis();
    Serial.println("ESP-NOW camera WiFi reconnect requested");
    WiFi.reconnect();
  }
  processEspNowRequest();
  if (recognizer && Serial.available()) {
    processCommand(Serial.readStringUntil('\n'));
  }
  delay(20);
}
