#ifndef MQTT_H
#define MQTT_H

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

enum MQTTCommand {
  MQTT_COMMAND_NONE,
  MQTT_COMMAND_OPEN,
  MQTT_COMMAND_CLOSE,
  MQTT_COMMAND_NORMAL,
  MQTT_COMMAND_LED_GREEN,
  MQTT_COMMAND_LED_RED,
  MQTT_COMMAND_BUZZER_ON,
  MQTT_COMMAND_BUZZER_OFF,
  MQTT_COMMAND_RESET_VIOLATION,
  MQTT_COMMAND_RFID_GRANTED,
  MQTT_COMMAND_RFID_DENIED,
  MQTT_COMMAND_FACE_GRANTED,
  MQTT_COMMAND_FACE_DENIED,
};

extern volatile MQTTCommand mqttPendingCommand;
extern char mqttRfidUid[32];
extern char mqttEmployeeId[32];
extern char mqttEmployeeName[64];
extern char mqttRfidReason[48];
extern bool mqttRfidSilent;
extern char mqttFaceRequestId[32];
extern float mqttFaceConfidence;


void wifi_connect();

void mqtt_connect();

void mqtt_setup();

void mqtt_upload_violate();
bool mqtt_request_rfid_auth(const char* rfidUid);
void mqtt_upload_granted(const char* rfidUid, const char* employeeId, const char* employeeName);
void mqtt_upload_denied(const char* rfidUid, const char* reason);
void mqtt_upload_face_granted(const char* employeeId, const char* employeeName, float confidence);
void mqtt_upload_face_denied(const char* reason, float confidence);
void mqtt_upload_status(const char* result);

void mqtt_loop();

#endif
