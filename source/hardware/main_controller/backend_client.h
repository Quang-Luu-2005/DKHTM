#pragma once

#include <Arduino.h>

class ControllerBackendClient {
 public:
  ControllerBackendClient(
    const char* baseUrl,
    const char* deviceSecret,
    const char* deviceId,
    const char* gateId
  );

  int sendEvent(
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
