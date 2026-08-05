#pragma once

#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

namespace sentinel_now {

constexpr uint32_t MAGIC = 0x534E544C; // SNTL
constexpr uint8_t VERSION = 1;
constexpr size_t EMPLOYEE_ID_LENGTH = 25;
constexpr size_t REASON_LENGTH = 32;

enum class MessageType : uint8_t {
  HELLO = 1,
  SCAN_REQUEST = 2,
  SCAN_RESULT = 3,
  ENROLL_REQUEST = 4,
  ENROLL_PROGRESS = 5,
  ENROLL_RESULT = 6,
};

enum class FaceResult : uint8_t {
  NOT_RUN = 0,
  VERIFIED = 1,
  UNKNOWN = 2,
  NO_FACE = 3,
  MULTIPLE_FACES = 4,
  FACE_TOO_SMALL = 5,
  CAMERA_ERROR = 6,
  BUSY = 7,
};

struct __attribute__((packed)) Message {
  uint32_t magic;
  uint8_t version;
  MessageType type;
  uint16_t size;
  uint32_t sequence;
  uint32_t sessionId;
  uint32_t sentAtMs;
  FaceResult result;
  uint8_t attempt;
  uint16_t reserved;
  float similarity;
  char employeeId[EMPLOYEE_ID_LENGTH];
  char reason[REASON_LENGTH];
};

static_assert(sizeof(Message) <= 250,
              "ESP-NOW v1 payload must fit in one packet");

inline Message makeMessage(MessageType type, uint32_t sequence,
                           uint32_t sessionId, uint32_t sentAtMs) {
  Message message = {};
  message.magic = MAGIC;
  message.version = VERSION;
  message.type = type;
  message.size = sizeof(Message);
  message.sequence = sequence;
  message.sessionId = sessionId;
  message.sentAtMs = sentAtMs;
  message.result = FaceResult::NOT_RUN;
  return message;
}

inline bool isValid(const Message &message) {
  return message.magic == MAGIC && message.version == VERSION &&
         message.size == sizeof(Message);
}

inline void copyText(char *destination, size_t destinationSize,
                     const char *source) {
  if (!destination || destinationSize == 0) return;
  snprintf(destination, destinationSize, "%s", source ? source : "");
}

inline const char *resultName(FaceResult result) {
  switch (result) {
  case FaceResult::VERIFIED: return "VERIFIED";
  case FaceResult::UNKNOWN: return "UNKNOWN";
  case FaceResult::NO_FACE: return "NO_FACE";
  case FaceResult::MULTIPLE_FACES: return "MULTIPLE_FACES";
  case FaceResult::FACE_TOO_SMALL: return "FACE_TOO_SMALL";
  case FaceResult::CAMERA_ERROR: return "CAMERA_ERROR";
  case FaceResult::BUSY: return "BUSY";
  default: return "NOT_RUN";
  }
}

} // namespace sentinel_now
