#include "RFID.h"

void Card::print_id() const {
  for (int i = 0; i < id_size; i++) {
    if (id[i] < 0x10) Serial.print("0");
    Serial.print(id[i], HEX);
    if (i + 1 < id_size) Serial.print(":");
  }
  Serial.println();
}

String Card::to_string() const {
  String value;
  for (int i = 0; i < id_size; i++) {
    if (id[i] < 0x10) value += "0";
    value += String(id[i], HEX);
    if (i + 1 < id_size) value += ":";
  }
  value.toUpperCase();
  return value;
}
