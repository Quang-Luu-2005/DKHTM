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
  MQTT_COMMAND_RFID_GRANTED,
  MQTT_COMMAND_RFID_DENIED,
  MQTT_COMMAND_FACE_GRANTED,
  MQTT_COMMAND_FACE_DENIED,
  MQTT_COMMAND_RFID_ENROLLMENT_START,
  MQTT_COMMAND_FACE_ENROLLMENT_START,
};

extern volatile MQTTCommand mqttPendingCommand;
extern char mqttRfidUid[32];
extern char mqttEmployeeId[32];
extern char mqttEmployeeName[64];
extern char mqttRfidReason[48];
extern bool mqttRfidSilent;
extern char mqttFaceRequestId[32];
extern float mqttFaceConfidence;
extern char mqttFaceEnrollmentEmployeeId[32];


void wifi_connect();

void mqtt_connect();

void mqtt_setup();

bool mqtt_request_rfid_auth(const char* rfidUid);
void mqtt_upload_granted(const char* rfidUid, const char* employeeId, const char* employeeName);
void mqtt_upload_denied(const char* rfidUid, const char* reason, uint8_t failedAttempts, bool counted);
void mqtt_upload_face_granted(const char* employeeId, const char* employeeName, float confidence);
void mqtt_upload_face_denied(const char* reason, float confidence, uint8_t failedAttempts, bool counted);
void mqtt_upload_face_enrollment(const char* status, const char* employeeId,
                                 const char* view, uint8_t completedViews,
                                 const char* reason);
void mqtt_upload_authentication_alert(const char* alertType, const char* authMethod, uint8_t failedAttempts);
void mqtt_upload_gate_climb_violation(int distanceCm);
void mqtt_upload_status(const char* result);

void mqtt_loop(bool allowReconnect = true);

bool mqtt_is_connected();

#endif
