#include "RFID.h"

void Card::print_id() {
  for (int i = 0; i < 4; i++) {
    if (id[i] < 0x10) Serial.print("0");
    Serial.print(id[i], HEX);
    Serial.print(" ");
  }
  Serial.println();
}
