#include "Gate.h"
#include "SystemConfig.h"

Gate::Gate(int pin):pin(pin), state(GATE_OPEN), timer(0) , angle(0){
}

void Gate::init() {
  servo.attach(pin);
}

void Gate::open() {
  if (!g_config.servo) return;
  if (angle != GATE_OPEN_ANGLE) {
    servo.write(GATE_OPEN_ANGLE);
    Serial.println("gate open");
    angle = GATE_OPEN_ANGLE;
  }
}

void Gate::close() {
  if (angle != GATE_CLOSE_ANGLE) {
    servo.write(GATE_CLOSE_ANGLE);
    Serial.println("gate close");
    angle = GATE_CLOSE_ANGLE;
  }
}

