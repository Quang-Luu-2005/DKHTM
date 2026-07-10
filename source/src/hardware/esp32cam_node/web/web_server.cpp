#include "web_server.h"

#include <WiFi.h>

#include "../core/app_state.h"
#include "web_handlers.h"

void sendCorsHeaders() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  webServer.sendHeader("Access-Control-Allow-Headers", "*");
}

void sendJsonResponse(int statusCode, const String& body) {
  sendCorsHeaders();
  webServer.sendHeader("Cache-Control", "no-store");
  webServer.send(statusCode, "application/json", body);
}

void handleOptions() {
  sendCorsHeaders();
  webServer.send(204, "text/plain", "");
}

void startPreviewServer() {
  webServer.on("/", HTTP_GET, handleRoot);
  webServer.on("/status", HTTP_GET, handleStatus);
  webServer.on("/capture", HTTP_GET, handleCapture);
  webServer.on("/stream", HTTP_GET, handleStream);
  webServer.on("/face/last-result", HTTP_GET, handleFaceLastResult);
  webServer.on("/face/enroll", HTTP_GET, handleFaceEnroll);
  webServer.on("/face/ids", HTTP_GET, handleFaceIds);
  webServer.on("/face/delete", HTTP_GET, handleFaceDelete);

  webServer.on("/", HTTP_OPTIONS, handleOptions);
  webServer.on("/status", HTTP_OPTIONS, handleOptions);
  webServer.on("/capture", HTTP_OPTIONS, handleOptions);
  webServer.on("/stream", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/last-result", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/enroll", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/ids", HTTP_OPTIONS, handleOptions);
  webServer.on("/face/delete", HTTP_OPTIONS, handleOptions);

  webServer.onNotFound(handleNotFound);
  webServer.begin();

  Serial.println("Preview server started.");
  Serial.print("Open web preview with: http://");
  Serial.println(WiFi.localIP());
  Serial.println("Open the repo root index.html and enter that URL.");
}
