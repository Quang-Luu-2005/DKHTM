#pragma once

#include <Arduino.h>

void initGateControl();
bool isGateUnlocked();
void lockGate();
void unlockGate(const String& reason, const String& cardUid = "", const String& personName = "");
