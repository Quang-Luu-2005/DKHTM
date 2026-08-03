#include "MQTT_connect.h"
#include "MQTT_secrets.h"
#include <Arduino.h>
#include "SystemConfig.h"
#include "Statistic.h"

extern SystemConfig g_config;
extern Statistic statistic;


WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);
volatile MQTTCommand mqttPendingCommand = MQTT_COMMAND_NONE;
char mqttRfidUid[32] = "";
char mqttEmployeeId[32] = "";
char mqttEmployeeName[64] = "";
char mqttRfidReason[48] = "";
bool mqttRfidSilent = false;
char mqttFaceRequestId[32] = "";
float mqttFaceConfidence = 0;

int port = 8883;
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* upload_topic = "/board/upload/data";
const char* get_topic = "/board/get/data";

//***Set server***
const char* mqttServer = MQTT_SERVER;
const char* username = MQTT_USERNAME;
const char* ID_password = MQTT_PASSWORD;

void wifi_connect() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");
}

void mqtt_connect() {
  while(!mqttClient.connected()) {
    Serial.println("Attemping MQTT connection...");
    String clientId = "ESP32Client-" + String(random(0xffff), HEX);
    if(mqttClient.connect(clientId.c_str(), username, ID_password)) {
      Serial.println("connected");

      //***Subscribe all topic you need***
      mqttClient.subscribe(get_topic);
      mqtt_upload_status("online");
     
    }
    else {
      Serial.print(mqttClient.state());
      Serial.println("try again in 5 seconds");
      delay(5000);
    }
  }
}

void parseSystemJson(const char* json) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.print("JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  const char* action = doc["action"] | "";
  if (strcmp(action, "open") == 0) mqttPendingCommand = MQTT_COMMAND_OPEN;
  else if (strcmp(action, "close") == 0) mqttPendingCommand = MQTT_COMMAND_CLOSE;
  else if (strcmp(action, "normal") == 0) mqttPendingCommand = MQTT_COMMAND_NORMAL;
  else if (strcmp(action, "led_green") == 0) mqttPendingCommand = MQTT_COMMAND_LED_GREEN;
  else if (strcmp(action, "led_red") == 0) mqttPendingCommand = MQTT_COMMAND_LED_RED;
  else if (strcmp(action, "buzzer_on") == 0) mqttPendingCommand = MQTT_COMMAND_BUZZER_ON;
  else if (strcmp(action, "buzzer_off") == 0) mqttPendingCommand = MQTT_COMMAND_BUZZER_OFF;
  else if (strcmp(action, "reset_violation") == 0) mqttPendingCommand = MQTT_COMMAND_RESET_VIOLATION;
  else if (strcmp(action, "rfid_result") == 0) {
    const char* rfidUid = doc["rfid_uid"] | "";
    const char* employeeId = doc["employee_id"] | "";
    const char* employeeName = doc["employee_name"] | "";
    const char* reason = doc["reason"] | "unknown";
    snprintf(mqttRfidUid, sizeof(mqttRfidUid), "%s", rfidUid);
    snprintf(mqttEmployeeId, sizeof(mqttEmployeeId), "%s", employeeId);
    snprintf(mqttEmployeeName, sizeof(mqttEmployeeName), "%s", employeeName);
    snprintf(mqttRfidReason, sizeof(mqttRfidReason), "%s", reason);
    mqttRfidSilent = doc["silent"] | false;
    mqttPendingCommand = (doc["authorized"] | false)
      ? MQTT_COMMAND_RFID_GRANTED
      : MQTT_COMMAND_RFID_DENIED;
  }
  else if (strcmp(action, "face_result") == 0) {
    const char* requestId = doc["request_id"] | "";
    const char* employeeId = doc["employee_id"] | "";
    const char* employeeName = doc["employee_name"] | "";
    const char* reason = doc["reason"] | "face_not_matched";
    snprintf(mqttFaceRequestId, sizeof(mqttFaceRequestId), "%s", requestId);
    snprintf(mqttEmployeeId, sizeof(mqttEmployeeId), "%s", employeeId);
    snprintf(mqttEmployeeName, sizeof(mqttEmployeeName), "%s", employeeName);
    snprintf(mqttRfidReason, sizeof(mqttRfidReason), "%s", reason);
    mqttFaceConfidence = doc["confidence"] | 0.0f;
    mqttPendingCommand = (doc["authorized"] | false)
      ? MQTT_COMMAND_FACE_GRANTED
      : MQTT_COMMAND_FACE_DENIED;
  }

  if (!doc["system"]["status"].isNull()) {
    int requestedState = doc["system"]["status"].as<int>();
    if (requestedState >= state_normal && requestedState < state_count) {
      g_config.system_state = (general_state)requestedState;
    }
  }
  g_config.rfid       = doc["devices"]["rfid"] | g_config.rfid;
  g_config.ultrasonic = doc["devices"]["ultrasonic"] | g_config.ultrasonic;
  g_config.buzzer     = doc["devices"]["buzzer"] | g_config.buzzer;
  g_config.servo      = doc["devices"]["servo"] | g_config.servo;
  g_config.camera     = doc["devices"]["camera"] | g_config.camera;
  g_config.led        = doc["devices"]["led"] | g_config.led;
  g_config.violation  = doc["deactivate"]["violation"] | g_config.violation;
}

//MQTT Receiver
void mqttcallback(char* topic, byte* message, unsigned int length) {
  char buffer[512];
  if (strcmp(topic, get_topic) == 0) {
    Serial.println(topic);
    size_t copyLength = min((size_t)length, sizeof(buffer) - 1);
    memcpy(buffer, message, copyLength);
    buffer[copyLength] = '\0';
    parseSystemJson(buffer);
  }
}

void mqtt_setup() {
  Serial.print("Connecting to WiFi");

  wifiClient.setInsecure();
  wifi_connect();
  mqttClient.setServer(mqttServer, port);
  mqttClient.setCallback(mqttcallback);
  mqttClient.setKeepAlive( 90 );
  mqttClient.setBufferSize(512);
}


void mqtt_loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Reconnecting to WiFi");
    wifi_connect();
  }
  if(!mqttClient.connected()) {
    Serial.println("Reconnecting to MQTT");
    mqtt_connect();
  }
  mqttClient.loop();
}

bool mqtt_request_rfid_auth(const char* rfidUid) {
  JsonDocument doc;
  char buffer[192];
  doc["event"] = "rfid_scan";
  doc["rfid_uid"] = rfidUid;

  serializeJson(doc, buffer, sizeof(buffer));
  bool published = mqttClient.publish(upload_topic, buffer);
  Serial.println(published ? "MQTT RFID check requested" : "MQTT RFID check failed");
  return published;
}

void mqtt_upload_granted(const char* rfidUid, const char* employeeId, const char* employeeName) {
  //***Publish data to MQTT Server***
  JsonDocument doc;
  char buffer[384];
  doc["event"] = "gate_event";
  doc["result"] = "granted";
  doc["access_method"] = "rfid";
  doc["gate"] = "open";
  doc["led"] = "green";
  doc["buzzer"] = "muted";
  doc["rfid_uid"] = rfidUid;
  doc["employee_id"] = employeeId;
  doc["employee_name"] = employeeName;
  doc["passes"] = statistic.normal;
  doc["violators"] = statistic.violator;

  serializeJson(doc, buffer, sizeof(buffer));
  bool published = mqttClient.publish(upload_topic, buffer);
  Serial.println(published ? "MQTT granted published" : "MQTT granted publish failed");
}

void mqtt_upload_denied(const char* rfidUid, const char* reason) {
  JsonDocument doc;
  char buffer[256];
  doc["event"] = "gate_event";
  doc["result"] = "denied";
  doc["access_method"] = "rfid";
  doc["gate"] = "closed";
  doc["led"] = "red";
  doc["buzzer"] = "muted";
  doc["rfid_uid"] = rfidUid;
  doc["reason"] = reason;
  doc["passes"] = statistic.normal;
  doc["violators"] = statistic.violator;

  serializeJson(doc, buffer, sizeof(buffer));
  bool published = mqttClient.publish(upload_topic, buffer);
  Serial.println(published ? "MQTT denied published" : "MQTT denied publish failed");
}

void mqtt_upload_face_granted(const char* employeeId, const char* employeeName, float confidence) {
  JsonDocument doc;
  char buffer[384];
  doc["event"] = "gate_event";
  doc["result"] = "granted";
  doc["access_method"] = "face";
  doc["gate"] = "open";
  doc["led"] = "green";
  doc["buzzer"] = "muted";
  doc["employee_id"] = employeeId;
  doc["employee_name"] = employeeName;
  doc["confidence"] = confidence;
  doc["passes"] = statistic.normal;
  doc["violators"] = statistic.violator;

  serializeJson(doc, buffer, sizeof(buffer));
  bool published = mqttClient.publish(upload_topic, buffer);
  Serial.println(published ? "MQTT face granted published" : "MQTT face granted failed");
}

void mqtt_upload_face_denied(const char* reason, float confidence) {
  JsonDocument doc;
  char buffer[320];
  doc["event"] = "gate_event";
  doc["result"] = "denied";
  doc["access_method"] = "face";
  doc["gate"] = "closed";
  doc["led"] = "red";
  doc["buzzer"] = "muted";
  doc["reason"] = reason;
  doc["confidence"] = confidence;
  doc["passes"] = statistic.normal;
  doc["violators"] = statistic.violator;

  serializeJson(doc, buffer, sizeof(buffer));
  bool published = mqttClient.publish(upload_topic, buffer);
  Serial.println(published ? "MQTT face denied published" : "MQTT face denied failed");
}

void mqtt_upload_violate() {
  JsonDocument doc;
  char buffer[256];
  doc["event"] = "gate_event";
  doc["result"] = "violated";
  doc["gate"] = "closed";
  doc["led"] = "red";
  doc["buzzer"] = "active";
  doc["violators"] = statistic.violator;
  doc["passes"] = statistic.normal;

  serializeJson(doc, buffer, sizeof(buffer));
  bool published = mqttClient.publish(upload_topic, buffer);
  Serial.println(published ? "MQTT violation published" : "MQTT violation publish failed");
}

void mqtt_upload_status(const char* result) {
 JsonDocument doc;
  char buffer[256];

  doc["event"] = "hardware_status";
  doc["result"] = result;
  doc["passes"] = statistic.normal;
  doc["violators"] = statistic.violator;

  if (strcmp(result, "opened") == 0) {
    doc["gate"] = "open";
    doc["led"] = "green";
    doc["buzzer"] = "muted";
  } else if (strcmp(result, "closed") == 0 || strcmp(result, "normal") == 0) {
    doc["gate"] = "closed";
    doc["led"] = "red";
    doc["buzzer"] = "muted";
  } else if (strcmp(result, "led_green") == 0) {
    doc["led"] = "green";
  } else if (strcmp(result, "led_red") == 0) {
    doc["led"] = "red";
  } else if (strcmp(result, "buzzer_active") == 0) {
    doc["buzzer"] = "active";
  } else if (strcmp(result, "buzzer_muted") == 0 || strcmp(result, "violation_reset") == 0) {
    doc["buzzer"] = "muted";
  }

  serializeJson(doc, buffer, sizeof(buffer));
  bool published = mqttClient.publish(upload_topic, buffer);
  Serial.println(published ? "MQTT status published" : "MQTT status publish failed");
}
