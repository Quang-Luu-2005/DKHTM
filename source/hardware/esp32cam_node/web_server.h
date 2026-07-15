#pragma once

#include <Arduino.h>
#include <WiFi.h>

#include "app_state.h"

static void sendCorsHeaders() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  webServer.sendHeader("Access-Control-Allow-Headers", "*");
}

static void sendJsonResponse(int statusCode, const String& body) {
  sendCorsHeaders();
  webServer.sendHeader("Cache-Control", "no-store");
  webServer.send(statusCode, "application/json", body);
}

static void handleOptions() {
  sendCorsHeaders();
  webServer.send(204, "text/plain", "");
}

static void registerPreviewRoutes();

static void startPreviewServer() {
  registerPreviewRoutes();
  webServer.begin();

  Serial.println("Preview server started.");
  Serial.print("Open web preview with: http://");
  Serial.println(WiFi.localIP());
  Serial.println("Camera preview endpoints are ready on this address.");
}
