#include "EspNowFace.h"

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

namespace {
const uint8_t BROADCAST_ADDRESS[6] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
portMUX_TYPE receiveMux = portMUX_INITIALIZER_UNLOCKED;
sentinel_now::Message receivedResult = {};
volatile bool resultAvailable = false;
bool transportReady = false;
uint32_t nextSequence = 1;

void onDataSent(const uint8_t *, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("ESP-NOW face request delivery failed");
  }
}

void onDataReceived(const uint8_t *, const uint8_t *data, int length) {
  if (!data || length != static_cast<int>(sizeof(sentinel_now::Message))) return;
  sentinel_now::Message message = {};
  memcpy(&message, data, sizeof(message));
  if (!sentinel_now::isValid(message) ||
      (message.type != sentinel_now::MessageType::SCAN_RESULT &&
       message.type != sentinel_now::MessageType::ENROLL_PROGRESS &&
       message.type != sentinel_now::MessageType::ENROLL_RESULT)) {
    return;
  }

  portENTER_CRITICAL_ISR(&receiveMux);
  receivedResult = message;
  resultAvailable = true;
  portEXIT_CRITICAL_ISR(&receiveMux);
}

bool addBroadcastPeer(uint8_t channel) {
  if (esp_now_is_peer_exist(BROADCAST_ADDRESS)) return true;
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BROADCAST_ADDRESS, sizeof(BROADCAST_ADDRESS));
  peer.channel = channel;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}
} // namespace

bool esp_now_face_setup() {
  if (transportReady) return true;
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ESP-NOW setup failed: WiFi is not connected");
    return false;
  }

  uint8_t primaryChannel = 0;
  wifi_second_chan_t secondaryChannel = WIFI_SECOND_CHAN_NONE;
  if (esp_wifi_get_channel(&primaryChannel, &secondaryChannel) != ESP_OK) {
    Serial.println("ESP-NOW setup failed: cannot read WiFi channel");
    return false;
  }
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW setup failed: esp_now_init");
    return false;
  }
  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataReceived);
  if (!addBroadcastPeer(primaryChannel)) {
    Serial.println("ESP-NOW setup failed: cannot add broadcast peer");
    esp_now_deinit();
    return false;
  }

  transportReady = true;
  Serial.printf("ESP-NOW controller ready|mac=%s|channel=%u\n",
                WiFi.macAddress().c_str(), primaryChannel);
  return true;
}

bool esp_now_face_request(uint32_t sessionId, uint8_t attempt,
                          uint32_t &sequenceOut) {
  if (!transportReady || sessionId == 0) return false;
  if (nextSequence == 0) nextSequence = 1;
  sequenceOut = nextSequence++;
  sentinel_now::Message message = sentinel_now::makeMessage(
      sentinel_now::MessageType::SCAN_REQUEST, sequenceOut, sessionId,
      millis());
  message.attempt = attempt;
  const esp_err_t result = esp_now_send(
      BROADCAST_ADDRESS, reinterpret_cast<const uint8_t *>(&message),
      sizeof(message));
  if (result == ESP_OK) {
    Serial.printf("ESP-NOW SCAN_REQUEST|session=%lu|sequence=%lu|attempt=%u\n",
                  static_cast<unsigned long>(sessionId),
                  static_cast<unsigned long>(sequenceOut), attempt);
    return true;
  }
  Serial.printf("ESP-NOW SCAN_REQUEST failed|code=%d\n", result);
  return false;
}

bool esp_now_face_enrollment_request(const char *employeeId,
                                     uint32_t &sequenceOut) {
  if (!transportReady || !employeeId || employeeId[0] == '\0') return false;
  if (nextSequence == 0) nextSequence = 1;
  sequenceOut = nextSequence++;
  sentinel_now::Message message = sentinel_now::makeMessage(
      sentinel_now::MessageType::ENROLL_REQUEST, sequenceOut, 0, millis());
  sentinel_now::copyText(message.employeeId, sizeof(message.employeeId),
                         employeeId);
  const esp_err_t result = esp_now_send(
      BROADCAST_ADDRESS, reinterpret_cast<const uint8_t *>(&message),
      sizeof(message));
  if (result == ESP_OK) {
    Serial.printf("ESP-NOW ENROLL_REQUEST|employee=%s|sequence=%lu\n",
                  message.employeeId,
                  static_cast<unsigned long>(sequenceOut));
    return true;
  }
  Serial.printf("ESP-NOW ENROLL_REQUEST failed|code=%d\n", result);
  return false;
}

bool esp_now_face_take_result(sentinel_now::Message &resultOut) {
  bool available = false;
  portENTER_CRITICAL(&receiveMux);
  if (resultAvailable) {
    resultOut = receivedResult;
    resultAvailable = false;
    available = true;
  }
  portEXIT_CRITICAL(&receiveMux);
  return available;
}

bool esp_now_face_ready() {
  if (transportReady && WiFi.status() != WL_CONNECTED) {
    esp_now_deinit();
    transportReady = false;
    resultAvailable = false;
    Serial.println("ESP-NOW paused until WiFi channel is restored");
  }
  return transportReady;
}
