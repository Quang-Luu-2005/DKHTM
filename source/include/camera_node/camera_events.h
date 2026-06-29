#pragma once

#include <Arduino.h>

void sendCameraEvent(const String& eventType, const String& message);
bool uploadSnapshot();
