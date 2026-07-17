#ifndef RFID_H
#define RFID_H

#include <Arduino.h>
#include <MFRC522.h>

struct Card {
  uint8_t id[10];
  uint8_t id_size;

  void print_id();
};

struct RFID {
  uint8_t _ssPin;
  uint8_t _rstPin;

  MFRC522 mfrc522;
  MFRC522::MIFARE_Key key;

  RFID(uint8_t ssPin, uint8_t rstPin);

  void init();
  void update_state(bool state);
  Card get_ID();
  bool is_read();
};

#endif

