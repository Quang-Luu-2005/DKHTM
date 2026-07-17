#include "MQTT_connect.h"
#include <Arduino.h>
#include "SystemConfig.h"
#include "Statistic.h"

extern SystemConfig g_config;
extern Statistic statistic;


WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);

int port = 8883;
const char* ssid = "itel P55+";
const char* password = "trancaovan";
const char* upload_topic = "/board/upload/data";
const char* get_topic = "/board/get/data";

//***Set server***
const char* mqttServer = "8d4448afba8840598471baa60fc3699d.s1.eu.hivemq.cloud"; 
const char* username = "tcvan";
const char* ID_password = "Tranvan8787";

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
     
    }
    else {
      Serial.print(mqttClient.state());
      Serial.println("try again in 5 seconds");
      delay(5000);
    }
  }
}

void parseSystemJson(const char* json) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.print("JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  g_config.system_state = (general_state)doc["system"]["status"].as<int>();
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
  char buffer[256];
  if (strcmp(topic, get_topic) == 0) {
    Serial.println(topic);
    memcpy(buffer, message, length);
    buffer[length] = '\0';
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

void mqtt_upload_granted() {
  //***Publish data to MQTT Server***
  StaticJsonDocument<256> doc;
  char buffer[256];
  doc["event"] = "gate_event";
  doc["result"] = "granted";

  serializeJson(doc, buffer);
  mqttClient.publish(upload_topic, buffer);
}

void mqtt_upload_violate() {
  StaticJsonDocument<256> doc;
  char buffer[256];
  doc["event"] = "gate_event";
  doc["result"] = "violated";
  doc["violators"] = statistic.violator;
  doc["passes"] = statistic.normal;

  serializeJson(doc, buffer);
  mqttClient.publish(upload_topic, buffer);
}
