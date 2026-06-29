#pragma once

#include <Arduino.h>

int postJsonToBackend(const String& path, const String& body, String* responseBody = nullptr);
int postJpegToBackend(const String& pathAndQuery, uint8_t* payload, size_t payloadLength);
