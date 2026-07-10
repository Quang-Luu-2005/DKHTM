#pragma once

#include <Arduino.h>

void sendCorsHeaders();
void sendJsonResponse(int statusCode, const String& body);
void startPreviewServer();
