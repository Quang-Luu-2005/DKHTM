#include "RfidRegistry.h"

#include <Preferences.h>
#include <esp_rom_crc.h>

namespace {
constexpr uint32_t REGISTRY_MAGIC = 0x52464944; // "RFID"
constexpr uint16_t REGISTRY_FORMAT_VERSION = 1;
constexpr char NVS_NAMESPACE[] = "sentinel-rfid";
constexpr char NVS_KEY[] = "registry";

String normalizeUid(String uid) {
  uid.trim();
  uid.toUpperCase();
  uid.replace('-', ':');
  return uid;
}

} // namespace

uint32_t RfidRegistry::calculateCrc(const PersistedRegistry &registry) {
  return esp_rom_crc32_le(
      0, reinterpret_cast<const uint8_t *>(&registry),
      offsetof(PersistedRegistry, crc));
}

void RfidRegistry::reset() {
  memset(&data_, 0, sizeof(data_));
  data_.magic = REGISTRY_MAGIC;
  data_.formatVersion = REGISTRY_FORMAT_VERSION;
}

bool RfidRegistry::begin() {
  reset();
  Preferences preferences;
  if (!preferences.begin(NVS_NAMESPACE, true)) {
    Serial.println("RFID registry NVS open failed");
    return false;
  }
  const size_t storedLength = preferences.getBytesLength(NVS_KEY);
  const size_t readLength = storedLength == sizeof(data_)
                                ? preferences.getBytes(NVS_KEY, &data_, sizeof(data_))
                                : 0;
  preferences.end();

  const bool valid = readLength == sizeof(data_) &&
                     data_.magic == REGISTRY_MAGIC &&
                     data_.formatVersion == REGISTRY_FORMAT_VERSION &&
                     data_.count <= MAX_RECORDS && data_.crc == calculateCrc(data_);
  if (!valid) {
    reset();
    Serial.println("RFID registry empty or invalid; waiting for sync");
    return false;
  }
  Serial.printf("RFID registry restored|records=%u|version=%lu\n", data_.count,
                static_cast<unsigned long>(data_.registryVersion));
  return true;
}

bool RfidRegistry::persist() {
  data_.crc = calculateCrc(data_);
  Preferences preferences;
  if (!preferences.begin(NVS_NAMESPACE, false)) return false;
  const size_t written = preferences.putBytes(NVS_KEY, &data_, sizeof(data_));
  preferences.end();
  return written == sizeof(data_);
}

bool RfidRegistry::find(const String &uid, RfidIdentity &identity) const {
  const String normalized = normalizeUid(uid);
  for (size_t index = 0; index < data_.count; ++index) {
    if (normalized.equalsIgnoreCase(data_.records[index].uid)) {
      identity = data_.records[index];
      return true;
    }
  }
  return false;
}

bool RfidRegistry::replaceFromJson(JsonArrayConst cards, uint32_t version) {
  if (version != 0 && version == data_.registryVersion) {
    Serial.printf("RFID registry already current|records=%u|version=%lu\n",
                  data_.count, static_cast<unsigned long>(version));
    return true;
  }
  if (cards.size() > MAX_RECORDS) {
    Serial.printf("RFID registry rejected|reason=too_many_records|count=%u\n",
                  static_cast<unsigned>(cards.size()));
    return false;
  }

  PersistedRegistry replacement = {};
  replacement.magic = REGISTRY_MAGIC;
  replacement.formatVersion = REGISTRY_FORMAT_VERSION;
  replacement.registryVersion = version;

  for (JsonObjectConst card : cards) {
    const char *rawUid = card["uid"] | "";
    const char *employeeId = card["employeeId"] | "";
    const char *employeeName = card["employeeName"] | "";
    const String uid = normalizeUid(rawUid);
    if (uid.isEmpty() || !employeeId[0] ||
        uid.length() >= sizeof(replacement.records[0].uid) ||
        strlen(employeeId) >= sizeof(replacement.records[0].employeeId) ||
        strlen(employeeName) >= sizeof(replacement.records[0].employeeName)) {
      Serial.println("RFID registry rejected|reason=invalid_record");
      return false;
    }

    for (size_t existing = 0; existing < replacement.count; ++existing) {
      if (uid.equalsIgnoreCase(replacement.records[existing].uid)) {
        Serial.println("RFID registry rejected|reason=duplicate_uid");
        return false;
      }
    }

    RfidIdentity &record = replacement.records[replacement.count++];
    snprintf(record.uid, sizeof(record.uid), "%s", uid.c_str());
    snprintf(record.employeeId, sizeof(record.employeeId), "%s", employeeId);
    snprintf(record.employeeName, sizeof(record.employeeName), "%s", employeeName);
  }

  data_ = replacement;
  if (!persist()) {
    Serial.println("RFID registry sync failed|reason=nvs_write");
    return false;
  }
  Serial.printf("RFID registry synchronized|records=%u|version=%lu\n", data_.count,
                static_cast<unsigned long>(data_.registryVersion));
  return true;
}

size_t RfidRegistry::size() const { return data_.count; }

uint32_t RfidRegistry::version() const { return data_.registryVersion; }
