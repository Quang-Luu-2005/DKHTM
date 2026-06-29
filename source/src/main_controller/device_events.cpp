#include "main_controller/device_events.h"

#include <ArduinoJson.h>

#include "common/backend_client.h"
#include "config/project_config.h"
#include "main_controller/gate_control.h"
#include "main_controller/sensors.h"

void sendDeviceEvent(
  const String& eventType,
  const String& message,
  const String& cardUid,
  const String& personName
) {
  StaticJsonDocument<768> doc;
  doc["deviceId"] = kEsp32MainDeviceId;
  doc["doorId"] = kDoorId;
  doc["source"] = "ESP32_MAIN";
  doc["eventType"] = eventType;
  doc["message"] = message;
  doc["cardUid"] = cardUid;
  doc["personName"] = personName;
  doc["gateUnlocked"] = isGateUnlocked();
  doc["doorOpen"] = isDoorOpen();
  doc["personNearGate"] = isPersonNearGate();

  String body;
  serializeJson(doc, body);

  int statusCode = postJsonToBackend("/api/device/events", body);

  Serial.print("Send event ");
  Serial.print(eventType);
  Serial.print(" status: ");
  Serial.println(statusCode);
}
