#pragma once

#include <Arduino.h>

void sendDeviceEvent(
  const String& eventType,
  const String& message,
  const String& cardUid = "",
  const String& personName = ""
);
