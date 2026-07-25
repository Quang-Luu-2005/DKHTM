#include "rfid_reader.h"

#include <SPI.h>

RfidReader::RfidReader(uint8_t ssPin, uint8_t rstPin)
    : reader_(ssPin, rstPin) {}

void RfidReader::begin(uint8_t sckPin, uint8_t misoPin, uint8_t mosiPin) {
  SPI.begin(sckPin, misoPin, mosiPin);
  reader_.PCD_Init();
  Serial.println("RFID reader initialized.");
}

bool RfidReader::poll(String& uid) {
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
