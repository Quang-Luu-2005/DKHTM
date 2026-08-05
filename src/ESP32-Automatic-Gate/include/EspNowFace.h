#pragma once

#include <Arduino.h>
#include "EspNowFaceProtocol.h"

bool esp_now_face_setup();
bool esp_now_face_request(uint32_t sessionId, uint8_t attempt,
                          uint32_t &sequenceOut);
bool esp_now_face_enrollment_request(const char *employeeId,
                                     uint32_t &sequenceOut);
bool esp_now_face_take_result(sentinel_now::Message &resultOut);
bool esp_now_face_ready();
