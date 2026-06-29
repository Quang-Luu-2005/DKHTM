#include "main_controller/rfid_access.h"

#include <ArduinoJson.h>
#include <MFRC522.h>
#include <SPI.h>

#include "common/backend_client.h"
#include "config/project_config.h"
#include "main_controller/device_events.h"
#include "main_controller/gate_control.h"
#include "main_controller/indicators.h"
#include "pins/main_controller_pins.h"

namespace {
MFRC522 rfid(kRfidSsPin, kRfidRstPin);

String readCardUid() {
  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uid += "0";
    }

    uid += String(rfid.uid.uidByte[i], HEX);
  }

  uid.toUpperCase();
  return uid;
}

bool verifyCardWithBackend(const String& cardUid, String& personName) {
  personName = "";

  StaticJsonDocument<256> doc;
  doc["deviceId"] = kEsp32MainDeviceId;
  doc["doorId"] = kDoorId;
  doc["cardUid"] = cardUid;

  String body;
  serializeJson(doc, body);

  String response;
  int statusCode = postJsonToBackend("/api/device/rfid/verify", body, &response);

  Serial.print("Verify card status: ");
  Serial.println(statusCode);
  Serial.print("Verify response: ");
  Serial.println(response);

  if (statusCode < 200 || statusCode >= 300) {
    return false;
  }

  StaticJsonDocument<256> resDoc;
  DeserializationError error = deserializeJson(resDoc, response);

  if (error) {
    Serial.print("Parse verify response failed: ");
    Serial.println(error.c_str());
    return false;
  }

  bool allow = resDoc["allow"] | false;
  const char* name = resDoc["personName"] | "";
  personName = String(name);
  return allow;
}
}  // namespace

void initRfidReader() {
  SPI.begin(kRfidSckPin, kRfidMisoPin, kRfidMosiPin, kRfidSsPin);
  rfid.PCD_Init();
}

void handleRfid() {
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  String cardUid = readCardUid();

  Serial.print("Card UID: ");
  Serial.println(cardUid);

  String personName = "";
  bool allowed = verifyCardWithBackend(cardUid, personName);

  if (allowed) {
    unlockGate("RFID card accepted", cardUid, personName);
  } else {
    Serial.println("Access denied.");
    signalDenied();
    sendDeviceEvent("ACCESS_DENIED", "RFID card rejected", cardUid, "");
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(500);
}
