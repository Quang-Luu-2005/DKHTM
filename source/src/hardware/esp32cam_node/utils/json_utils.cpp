#include "json_utils.h"

#include "../core/app_state.h"
#include "../core/config.h"

String escapeJson(const String& value) {
  String escaped;
  escaped.reserve(value.length() + 8);

  for (size_t i = 0; i < value.length(); ++i) {
    const char ch = value.charAt(i);
    switch (ch) {
      case '\\':
        escaped += "\\\\";
        break;
      case '"':
        escaped += "\\\"";
        break;
      case '\n':
        escaped += "\\n";
        break;
      case '\r':
        escaped += "\\r";
        break;
      case '\t':
        escaped += "\\t";
        break;
      default:
        escaped += ch;
        break;
    }
  }

  return escaped;
}

String normalizeIdentityName(String value) {
  value.trim();
  value.replace("\n", " ");
  value.replace("\r", " ");
  value.replace("\t", " ");

  while (value.indexOf("  ") >= 0) {
    value.replace("  ", " ");
  }

  if (value.length() > kMaxEnrollNameLength) {
    value = value.substring(0, kMaxEnrollNameLength);
    value.trim();
  }

  return value;
}

bool queryFlag(const char* name, bool defaultValue) {
  if (!webServer.hasArg(name)) {
    return defaultValue;
  }

  String value = webServer.arg(name);
  value.trim();
  value.toLowerCase();
  return value == "1" || value == "true" || value == "yes" || value == "on";
}

int queryInt(const char* name, int defaultValue, int minValue, int maxValue) {
  if (!webServer.hasArg(name)) {
    return defaultValue;
  }

  int value = webServer.arg(name).toInt();
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

String faceRecognitionMode() {
  return "snapshot/manual";
}
