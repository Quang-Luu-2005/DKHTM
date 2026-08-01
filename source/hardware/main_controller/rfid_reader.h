#pragma once

#include <Arduino.h>
#include <MFRC522.h>
#include <SPI.h>

class RfidReader {
 public:
  RfidReader(uint8_t ssPin, uint8_t rstPin);

  void begin(uint8_t sckPin, uint8_t misoPin, uint8_t mosiPin);
  bool poll(String& uid);

 private:
  MFRC522 reader_;
};

inline RfidReader::RfidReader(uint8_t ssPin, uint8_t rstPin)
    : reader_(ssPin, rstPin) {}

inline void RfidReader::begin(uint8_t sckPin, uint8_t misoPin, uint8_t mosiPin) {
  SPI.begin(sckPin, misoPin, mosiPin);
  reader_.PCD_Init();
  Serial.println("RFID reader initialized.");
}

inline bool RfidReader::poll(String& uid) {
  if (!reader_.PICC_IsNewCardPresent() || !reader_.PICC_ReadCardSerial()) {
    return false;
  }

  uid = "";
  for (byte index = 0; index < reader_.uid.size; index++) {
    if (index > 0) {
      uid += ":";
    }
    if (reader_.uid.uidByte[index] < 0x10) {
      uid += "0";
    }
    uid += String(reader_.uid.uidByte[index], HEX);
  }
  uid.toUpperCase();

  reader_.PICC_HaltA();
  reader_.PCD_StopCrypto1();
  return true;
}
