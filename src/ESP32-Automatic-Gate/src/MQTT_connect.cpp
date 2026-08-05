#include "MQTT_connect.h"
#include "MQTT_secrets.h"
#include "RfidRegistry.h"
#include "Statistic.h"
#include "SystemConfig.h"
#include <Arduino.h>

extern SystemConfig g_config;
extern Statistic statistic;
extern RfidRegistry rfidRegistry;

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
char mqttFaceEnrollmentEmployeeId[32] = "";

namespace {
constexpr int MQTT_PORT = 8883;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
constexpr unsigned long MQTT_RETRY_INTERVAL_MS = 5000;
const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;
const char *uploadTopic = "/board/upload/data";
const char *commandTopic = "/board/get/data";
const char *mqttServer = MQTT_SERVER;
const char *username = MQTT_USERNAME;
const char *mqttPassword = MQTT_PASSWORD;
unsigned long lastWiFiAttemptAt = 0;
unsigned long lastMqttAttemptAt = 0;
bool wifiWasConnected = false;
char commandBuffer[3072];

bool publish_json(JsonDocument &doc, char *buffer, size_t bufferSize,
                  const char *successMessage, const char *failureMessage) {
  serializeJson(doc, buffer, bufferSize);
  const bool published = mqttClient.publish(uploadTopic, buffer);
  Serial.println(published ? successMessage : failureMessage);
  return published;
}
} // namespace

void wifi_connect() {
  lastWiFiAttemptAt = millis();
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.println("WiFi connection attempt started");
}

void mqtt_connect() {
  lastMqttAttemptAt = millis();
  Serial.println("Attempting MQTT connection...");
  const String clientId = "ESP32Client-" + String(random(0xffff), HEX);
  if (mqttClient.connect(clientId.c_str(), username, mqttPassword)) {
    Serial.println("MQTT connected");
    mqttClient.subscribe(commandTopic);
    mqtt_upload_status("online");
  } else {
    Serial.print("MQTT state: ");
    Serial.println(mqttClient.state());
  }
}

void parseSystemJson(const char *json) {
  JsonDocument doc;
  const DeserializationError error = deserializeJson(doc, json);
  if (error) {
    Serial.print("JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  const char *action = doc["action"] | "";
  if (strcmp(action, "open") == 0) mqttPendingCommand = MQTT_COMMAND_OPEN;
  else if (strcmp(action, "close") == 0) mqttPendingCommand = MQTT_COMMAND_CLOSE;
  else if (strcmp(action, "normal") == 0) mqttPendingCommand = MQTT_COMMAND_NORMAL;
  else if (strcmp(action, "led_green") == 0) mqttPendingCommand = MQTT_COMMAND_LED_GREEN;
  else if (strcmp(action, "led_red") == 0) mqttPendingCommand = MQTT_COMMAND_LED_RED;
  else if (strcmp(action, "buzzer_on") == 0) mqttPendingCommand = MQTT_COMMAND_BUZZER_ON;
  else if (strcmp(action, "buzzer_off") == 0) mqttPendingCommand = MQTT_COMMAND_BUZZER_OFF;
  else if (strcmp(action, "rfid_enrollment_start") == 0) {
    mqttPendingCommand = MQTT_COMMAND_RFID_ENROLLMENT_START;
  }
  else if (strcmp(action, "face_enrollment_start") == 0) {
    snprintf(mqttFaceEnrollmentEmployeeId,
             sizeof(mqttFaceEnrollmentEmployeeId), "%s",
             doc["employee_id"] | "");
    mqttPendingCommand = MQTT_COMMAND_FACE_ENROLLMENT_START;
  }
  else if (strcmp(action, "rfid_result") == 0) {
    snprintf(mqttRfidUid, sizeof(mqttRfidUid), "%s", doc["rfid_uid"] | "");
    snprintf(mqttEmployeeId, sizeof(mqttEmployeeId), "%s", doc["employee_id"] | "");
    snprintf(mqttEmployeeName, sizeof(mqttEmployeeName), "%s", doc["employee_name"] | "");
    snprintf(mqttRfidReason, sizeof(mqttRfidReason), "%s", doc["reason"] | "unknown");
    mqttRfidSilent = doc["silent"] | false;
    mqttPendingCommand = (doc["authorized"] | false)
                             ? MQTT_COMMAND_RFID_GRANTED
                             : MQTT_COMMAND_RFID_DENIED;
  } else if (strcmp(action, "face_result") == 0) {
    snprintf(mqttFaceRequestId, sizeof(mqttFaceRequestId), "%s", doc["request_id"] | "");
    snprintf(mqttEmployeeId, sizeof(mqttEmployeeId), "%s", doc["employee_id"] | "");
    snprintf(mqttEmployeeName, sizeof(mqttEmployeeName), "%s", doc["employee_name"] | "");
    snprintf(mqttRfidReason, sizeof(mqttRfidReason), "%s", doc["reason"] | "face_not_matched");
    mqttFaceConfidence = doc["confidence"] | 0.0f;
    mqttPendingCommand = (doc["authorized"] | false)
                             ? MQTT_COMMAND_FACE_GRANTED
                             : MQTT_COMMAND_FACE_DENIED;
  } else if (strcmp(action, "rfid_registry_replace") == 0) {
    const uint32_t version = doc["version"] | 0;
    JsonArrayConst cards = doc["cards"].as<JsonArrayConst>();
    if (cards.isNull()) {
      Serial.println("RFID registry sync rejected|reason=missing_cards");
    } else {
      rfidRegistry.replaceFromJson(cards, version);
    }
  }

  if (!doc["system"]["status"].isNull()) {
    const int requestedState = doc["system"]["status"].as<int>();
    if (requestedState >= state_normal && requestedState < state_count) {
      g_config.system_state = static_cast<general_state>(requestedState);
    }
  }
  g_config.rfid = doc["devices"]["rfid"] | g_config.rfid;
  g_config.ultrasonic = doc["devices"]["ultrasonic"] | g_config.ultrasonic;
  g_config.buzzer = doc["devices"]["buzzer"] | g_config.buzzer;
  g_config.servo = doc["devices"]["servo"] | g_config.servo;
  g_config.camera = doc["devices"]["camera"] | g_config.camera;
  g_config.led = doc["devices"]["led"] | g_config.led;
}

void mqttcallback(char *topic, byte *message, unsigned int length) {
  if (strcmp(topic, commandTopic) != 0) return;
  if (length >= sizeof(commandBuffer)) {
    Serial.printf("MQTT command rejected: payload too large (%u bytes)\n", length);
    return;
  }
  memcpy(commandBuffer, message, length);
  commandBuffer[length] = '\0';
  parseSystemJson(commandBuffer);
}

void mqtt_setup() {
  Serial.println("Starting WiFi/MQTT without blocking gate control");
  wifiClient.setInsecure();
  wifiClient.setTimeout(1000);
  mqttClient.setServer(mqttServer, MQTT_PORT);
  mqttClient.setCallback(mqttcallback);
  mqttClient.setKeepAlive(90);
  mqttClient.setSocketTimeout(1);
  mqttClient.setBufferSize(sizeof(commandBuffer));
  WiFi.setAutoReconnect(true);
  wifi_connect();
  lastMqttAttemptAt = millis() - MQTT_RETRY_INTERVAL_MS;
}

void mqtt_loop(bool allowReconnect) {
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiWasConnected) {
      wifiWasConnected = false;
      Serial.println("WiFi disconnected; local gate control remains active");
    }
    if (allowReconnect && millis() - lastWiFiAttemptAt >= WIFI_RETRY_INTERVAL_MS) {
      wifi_connect();
    }
    return;
  }

  if (!wifiWasConnected) {
    wifiWasConnected = true;
    Serial.print("WiFi connected|ip=");
    Serial.println(WiFi.localIP());
    lastMqttAttemptAt = millis() - MQTT_RETRY_INTERVAL_MS;
  }

  if (!mqttClient.connected() && allowReconnect &&
      millis() - lastMqttAttemptAt >= MQTT_RETRY_INTERVAL_MS) {
    mqtt_connect();
  }
  if (mqttClient.connected()) mqttClient.loop();
}

bool mqtt_is_connected() { return mqttClient.connected(); }

bool mqtt_request_rfid_auth(const char *rfidUid) {
  JsonDocument doc;
  char buffer[192];
  doc["event"] = "rfid_scan";
  doc["authorizationMode"] = "LOCAL";
  doc["rfid_uid"] = rfidUid;
  return publish_json(doc, buffer, sizeof(buffer), "MQTT RFID check requested",
                      "MQTT RFID check failed");
}

void mqtt_upload_granted(const char *rfidUid, const char *employeeId,
                         const char *employeeName) {
  JsonDocument doc;
  char buffer[512];
  doc["event"] = "gate_event";
  doc["eventType"] = "AUTH_SUCCESS";
  doc["result"] = "granted";
  doc["authMethod"] = "RFID";
  doc["access_method"] = "rfid";
  doc["decision"] = "GRANTED";
  doc["gateState"] = "OPEN";
  doc["gate"] = "open";
  doc["led"] = "green";
  doc["buzzer"] = "muted";
  doc["rfid_uid"] = rfidUid;
  doc["employee_id"] = employeeId;
  doc["employee_name"] = employeeName;
  doc["passes"] = statistic.normal;
  doc["authenticationAlerts"] = statistic.authenticationAlerts;
  publish_json(doc, buffer, sizeof(buffer), "MQTT AUTH_SUCCESS published",
               "MQTT AUTH_SUCCESS publish failed");
}

void mqtt_upload_denied(const char *rfidUid, const char *reason,
                        uint8_t failedAttempts, bool counted) {
  JsonDocument doc;
  char buffer[384];
  doc["event"] = "gate_event";
  doc["eventType"] = counted ? "AUTH_FAILURE" : "AUTH_RETRY";
  doc["result"] = counted ? "denied" : "retry";
  doc["authMethod"] = "RFID";
  doc["access_method"] = "rfid";
  doc["decision"] = "DENIED";
  doc["gateState"] = "LOCKED";
  doc["gate"] = "closed";
  doc["led"] = "red";
  doc["buzzer"] = "muted";
  doc["rfid_uid"] = rfidUid;
  doc["reason"] = reason;
  doc["failedAttempts"] = failedAttempts;
  doc["counted"] = counted;
  publish_json(doc, buffer, sizeof(buffer), "MQTT RFID result published",
               "MQTT RFID result publish failed");
}

void mqtt_upload_face_granted(const char *employeeId, const char *employeeName,
                              float confidence) {
  JsonDocument doc;
  char buffer[512];
  doc["event"] = "gate_event";
  doc["eventType"] = "AUTH_SUCCESS";
  doc["result"] = "granted";
  doc["authMethod"] = "FACE";
  doc["access_method"] = "face";
  doc["decision"] = "GRANTED";
  doc["gateState"] = "OPEN";
  doc["gate"] = "open";
  doc["led"] = "green";
  doc["buzzer"] = "muted";
  doc["employee_id"] = employeeId;
  doc["employee_name"] = employeeName;
  doc["confidence"] = confidence;
  doc["passes"] = statistic.normal;
  doc["authenticationAlerts"] = statistic.authenticationAlerts;
  publish_json(doc, buffer, sizeof(buffer), "MQTT face AUTH_SUCCESS published",
               "MQTT face AUTH_SUCCESS publish failed");
}

void mqtt_upload_face_denied(const char *reason, float confidence,
                             uint8_t failedAttempts, bool counted) {
  JsonDocument doc;
  char buffer[384];
  doc["event"] = "gate_event";
  doc["eventType"] = counted ? "AUTH_FAILURE" : "AUTH_RETRY";
  doc["result"] = counted ? "denied" : "retry";
  doc["authMethod"] = "FACE";
  doc["access_method"] = "face";
  doc["decision"] = "DENIED";
  doc["gateState"] = "LOCKED";
  doc["gate"] = "closed";
  doc["led"] = "red";
  doc["buzzer"] = "muted";
  doc["reason"] = reason;
  doc["confidence"] = confidence;
  doc["failedAttempts"] = failedAttempts;
  doc["counted"] = counted;
  publish_json(doc, buffer, sizeof(buffer), "MQTT face result published",
               "MQTT face result publish failed");
}

void mqtt_upload_face_enrollment(const char *status, const char *employeeId,
                                 const char *view, uint8_t completedViews,
                                 const char *reason) {
  JsonDocument doc;
  char buffer[384];
  doc["event"] = "face_enrollment";
  doc["status"] = status;
  doc["employee_id"] = employeeId;
  doc["view"] = view;
  doc["completedViews"] = completedViews;
  doc["totalViews"] = 3;
  doc["reason"] = reason;
  publish_json(doc, buffer, sizeof(buffer),
               "MQTT face enrollment status published",
               "MQTT face enrollment status publish failed");
}

void mqtt_upload_authentication_alert(const char *alertType,
                                      const char *authMethod,
                                      uint8_t failedAttempts) {
  JsonDocument doc;
  char buffer[384];
  doc["event"] = "authentication_alert";
  doc["eventType"] = "AUTHENTICATION_ALERT";
  doc["alertType"] = alertType;
  doc["authMethod"] = authMethod;
  doc["failedAttempts"] = failedAttempts;
  doc["decision"] = "DENIED";
  doc["gateState"] = "LOCKED";
  doc["gate"] = "closed";
  doc["led"] = "red";
  doc["buzzer"] = "muted";
  doc["authenticationAlerts"] = statistic.authenticationAlerts;
  publish_json(doc, buffer, sizeof(buffer),
               "MQTT AUTHENTICATION_ALERT published",
               "MQTT AUTHENTICATION_ALERT publish failed");
}

void mqtt_upload_forced_lock_presence_alert() {
  JsonDocument doc;
  char buffer[384];
  doc["event"] = "forced_lock_alert";
  doc["eventType"] = "FORCED_LOCK_PRESENCE_ALERT";
  doc["alertType"] = "PRESENCE_DETECTED_DURING_FORCED_LOCK";
  doc["authMethod"] = "NONE";
  doc["decision"] = "DENIED";
  doc["gateState"] = "LOCKED";
  doc["gate"] = "closed";
  doc["led"] = "red";
  doc["buzzer"] = "muted";
  doc["authenticationAlerts"] = statistic.authenticationAlerts;
  publish_json(doc, buffer, sizeof(buffer),
               "MQTT FORCED_LOCK_PRESENCE_ALERT published",
               "MQTT FORCED_LOCK_PRESENCE_ALERT publish failed");
}

void mqtt_upload_status(const char *result) {
  JsonDocument doc;
  char buffer[320];
  doc["event"] = "hardware_status";
  doc["result"] = result;
  doc["passes"] = statistic.normal;
  doc["authenticationAlerts"] = statistic.authenticationAlerts;

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
  } else if (strcmp(result, "buzzer_muted") == 0) {
    doc["buzzer"] = "muted";
  }

  publish_json(doc, buffer, sizeof(buffer), "MQTT status published",
               "MQTT status publish failed");
}
