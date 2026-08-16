#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

struct RfidIdentity {
  char uid[32];
  char employeeId[32];
  char employeeName[64];
};

class RfidRegistry {
public:
  static constexpr size_t MAX_RECORDS = 20;

  bool begin();
  bool find(const String &uid, RfidIdentity &identity) const;
  bool replaceFromJson(JsonArrayConst cards, uint32_t version);
  size_t size() const;
  uint32_t version() const;

private:
  struct PersistedRegistry {
    uint32_t magic;
    uint16_t formatVersion;
    uint16_t count;
    uint32_t registryVersion;
    RfidIdentity records[MAX_RECORDS];
    uint32_t crc;
  };

  PersistedRegistry data_ = {};

  static uint32_t calculateCrc(const PersistedRegistry &registry);
  void reset();
  bool persist();
};
