#pragma once

#include <Arduino.h>
#include <MFRC522.h>

class RfidReader {
 public:
  RfidReader(uint8_t ssPin, uint8_t rstPin);

  void begin(uint8_t sckPin, uint8_t misoPin, uint8_t mosiPin);
  bool poll(String& uid);

 private:
  MFRC522 reader_;
};
