#include "MQTT_connect.h"
#include "SystemConfig.h"
#include <Arduino.h>

#include "Button.h"
#include "Buzzer.h"
#include "Gate.h"
#include "Led.h"
#include "RFID.h"
#include "Statistic.h"
#include "Ultrasonic.h"

SystemConfig g_config;
Statistic statistic;

RFID rfid(5, 16);
Gate gate(26);
Led led(33, 32);
Ultrasonic ultra(12, 13);
Buzzer buzzer(21);
Button button(17);

void setup() {
  Serial.begin(115200);
  rfid.init();
  gate.init();
  ultra.init();
  buzzer.init();
  button.init();
  led.init();

  Serial.println("ESP32 SERIAL OK");
  g_config.normal_run();
  gate.close();
  // mqtt_setup();
}

void procedure_open_gate() {
  Card new_card = rfid.get_ID();
  new_card.print_id();

  buzzer.low_pitch(300);
  gate.open();
  led.light_green();
  gate.state = GATE_OPEN;
  gate.timer = millis();
  delay(1000);
}

void procedure_close_gate() {
  gate.close();
  led.no_light();
  gate.state = GATE_CLOSED;
}

void loop() {
  // mqtt_loop();
  if (g_config.violation) {
    Serial.println("Violate");
    buzzer.high_pitch(200);
    led.light_red();
    buzzer.no_sound();
    delay(200);
    led.no_light();
    if (button.is_pressed())
      g_config.violation = false;
  } else {
    switch (g_config.system_state) {
    case state_normal: {
      if (rfid.is_read()) {
        if (gate.state == GATE_CLOSED) {
          Serial.println("open");
          statistic.normal++;
          // mqtt_upload_granted();
          procedure_open_gate();
        }
      } else {
        Serial.print("Time: ");
        Serial.println(millis() - gate.timer);
        if (gate.state == GATE_OPEN_ANGLE && millis() - gate.timer >= 1500) {
          Serial.print("start close");
          procedure_close_gate();
        }

        if (ultra.is_violate()) {
          statistic.violator++;
          g_config.violation = true;
          // mqtt_upload_violate();
        }
        procedure_close_gate();
      }
    } break;

    case state_always_open: {
      Serial.println("Always open");
      gate.open();
      led.light_green();
      buzzer.low_pitch(500);
      buzzer.no_sound();
    } break;

    case state_always_close: {
      Serial.println("Always close");
      gate.close();
      // led.no_light();
      led.light_red();
      if (ultra.is_violate()) {
        statistic.violator++;
        g_config.violation = true;
        // mqtt_upload_violate();
      }
    } break;

    default:
      break;
    }
  }
}
