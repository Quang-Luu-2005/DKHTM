#include "backend_client.h"

#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"

ControllerBackendClient::ControllerBackendClient(
  const char* baseUrl,
  const char* deviceSecret,
  const char* deviceId,
  const char* gateId
) : baseUrl_(baseUrl),
    deviceSecret_(deviceSecret),
    deviceId_(deviceId),
    gateId_(gateId) {}

String ControllerBackendClient::escapeJson(const String& value) {
  String escaped;
  escaped.reserve(value.length() + 8);
  for (size_t index = 0; index < value.length(); index++) {
    const char character = value[index];
    if (character == '"' || character == '\\') {
      escaped += '\\';
    }
    if (character == '\n') {
      escaped += "\\n";
    } else if (character != '\r') {
      escaped += character;
    }
  }
  return escaped;
}

String ControllerBackendClient::nextEventId() {
  if (bootId_ == 0) {
    bootId_ = esp_random();
  }
  sequence_++;
  return String("controller-") + String(bootId_, HEX) + "-" + String(sequence_);
}

int ControllerBackendClient::sendEvent(
  const String& eventType,
  const String& message,
  const String& extraJson,
  float confidence
) {
  if (WiFi.status() != WL_CONNECTED) {
    return -1;
  }

  String body = "{";
  body += "\"eventId\":\"" + nextEventId() + "\",";
  body += "\"deviceId\":\"" + String(deviceId_) + "\",";
  body += "\"gateId\":\"" + String(gateId_) + "\",";
  body += "\"source\":\"ESP32_CONTROLLER\",";
  body += "\"eventType\":\"" + escapeJson(eventType) + "\",";
  body += "\"message\":\"" + escapeJson(message) + "\",";
  body += "\"confidence\":" + String(confidence, 4);
  if (extraJson.length() > 0) {
    body += "," + extraJson;
  }
  body += "}";

  WiFiClient client;
  HTTPClient http;
  http.begin(client, String(baseUrl_) + "/api/device/events");
  http.setTimeout(ControllerConfig::kHttpTimeoutMs);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", deviceSecret_);
  const int statusCode = http.POST(body);
  const String response = http.getString();
  http.end();

  Serial.printf("Backend event %s -> %d: %s\n", eventType.c_str(), statusCode, response.c_str());
  return statusCode;
}
