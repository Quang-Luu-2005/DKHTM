#include "common/backend_client.h"

#include <HTTPClient.h>
#include <WiFiClient.h>

#include "common/wifi_manager.h"
#include "config/project_config.h"

int postJsonToBackend(const String& path, const String& body, String* responseBody) {
  if (!connectWiFi()) {
    Serial.println("WiFi not connected. Skip JSON request.");
    return -1;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(kServerBaseUrl) + path;

  http.begin(client, url);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-secret", kDeviceSecret);

  int statusCode = http.POST(body);

  if (responseBody != nullptr) {
    *responseBody = http.getString();
  }

  http.end();
  return statusCode;
}

int postJpegToBackend(const String& pathAndQuery, uint8_t* payload, size_t payloadLength) {
  if (!connectWiFi()) {
    Serial.println("WiFi not connected. Skip JPEG request.");
    return -1;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(kServerBaseUrl) + pathAndQuery;

  http.begin(client, url);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-device-secret", kDeviceSecret);

  int statusCode = http.POST(payload, payloadLength);

  http.end();
  return statusCode;
}
