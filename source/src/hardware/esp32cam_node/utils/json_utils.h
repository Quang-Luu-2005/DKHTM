#pragma once

#include <Arduino.h>

String escapeJson(const String& value);
String normalizeIdentityName(String value);
bool queryFlag(const char* name, bool defaultValue = false);
int queryInt(const char* name, int defaultValue, int minValue, int maxValue);
String faceRecognitionMode();
