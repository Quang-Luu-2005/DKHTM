#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"

struct BackendEventResponse {
  int statusCode = -1;
  String accessDecision;
  String commandId;

  bool successful() const {
    return statusCode >= 200 && statusCode < 300;
  }
};

class ControllerBackendClient {
 public:
  ControllerBackendClient(
    const char* baseUrl,
    const char* deviceSecret,
    const char* deviceId,
    const char* gateId
  );

  BackendEventResponse sendEvent(
    const String& eventType,
    const String& message,
    const String& extraJson = "",
    float confidence = 1.0F
  );

 private:
  String nextEventId();
  static String escapeJson(const String& value);

  const char* baseUrl_;
  const char* deviceSecret_;
  const char* deviceId_;
  const char* gateId_;
  uint32_t bootId_ = 0;
  unsigned long sequence_ = 0;
};

inline ControllerBackendClient::ControllerBackendClient(
  const char* baseUrl,
  const char* deviceSecret,
  const char* deviceId,
  const char* gateId
) : baseUrl_(baseUrl),
    deviceSecret_(deviceSecret),
    deviceId_(deviceId),
    gateId_(gateId) {}

inline String ControllerBackendClient::escapeJson(const String& value) {
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

inline String ControllerBackendClient::nextEventId() {
  if (bootId_ == 0) {
    bootId_ = esp_random();
  }
  sequence_++;
  return String("controller-") + String(bootId_, HEX) + "-" + String(sequence_);
}

inline BackendEventResponse ControllerBackendClient::sendEvent(
  const String& eventType,
  const String& message,
  const String& extraJson,
  float confidence
) {
  BackendEventResponse result;
  if (WiFi.status() != WL_CONNECTED) {
    return result;
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
  result.statusCode = http.POST(body);
  const String response = http.getString();
  http.end();

  Serial.printf(
    "Backend event %s -> %d: %s\n",
    eventType.c_str(),
    result.statusCode,
    response.c_str()
  );

  if (response.length() > 0) {
    JsonDocument document;
    const DeserializationError error = deserializeJson(document, response);
    if (!error) {
      result.accessDecision = String(document["accessDecision"] | "");
      result.commandId = String(document["commandId"] | "");
      result.accessDecision.toUpperCase();
    } else {
      Serial.printf("Backend JSON parse failed: %s\n", error.c_str());
    }
  }
  return result;
}
