#ifndef MQTT_H
#define MQTT_H

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>



void wifi_connect();

void mqtt_connect();

void mqtt_setup();

void mqtt_upload_violate();
void mqtt_upload_granted();

void mqtt_loop();

#endif