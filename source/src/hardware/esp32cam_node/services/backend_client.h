#pragma once

#include <Arduino.h>

bool isWiFiConnected();
bool connectWiFi();
int postJsonToBackend(const String& path, const String& body);
int postJpegToBackend(const String& pathAndQuery, uint8_t* payload, size_t payloadLength);
void sendCameraEvent(const String& eventType, const String& message);
bool uploadSnapshot();
void processBackendSnapshotTask();
