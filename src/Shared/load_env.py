Import("env")

import json
import os
from pathlib import Path


project_dir = Path(env.subst("$PROJECT_DIR"))
# Find .env in project_dir, src/.env, or root .env
if (project_dir / "src" / ".env").exists():
    shared_env_path = project_dir / "src" / ".env"
elif (project_dir / ".env").exists():
    shared_env_path = project_dir / ".env"
else:
    shared_env_path = project_dir.parent / ".env"
generated_header = project_dir / "include" / "env_config.generated.h"


def parse_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        values[key] = value
    return values


dotenv = parse_dotenv(shared_env_path)


def setting(name: str, default: str = "") -> str:
    return os.environ.get(name, dotenv.get(name, default)).strip()


def required(name: str) -> str:
    value = setting(name)
    if not value or value.startswith("YOUR_"):
        raise RuntimeError(f"{name} is empty in {shared_env_path}.")
    return value


def port_setting(name: str, default: int, forbidden: set[int] | None = None) -> int:
    raw_value = setting(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer.") from error
    if not 1 <= value <= 65535 or value in (forbidden or set()):
        raise RuntimeError(f"{name} is outside the supported port range.")
    return value


wifi_ssid = required("WIFI_SSID")
wifi_password = setting("WIFI_PASSWORD")
camera_hostname = setting("CAMERA_HOSTNAME", "sentinel-stream-cam")
stream_port = port_setting("STREAM_PORT", 81, {80})

mqtt_server = setting("MQTT_SERVER")
mqtt_port = port_setting("MQTT_PORT", 8883)
mqtt_username = setting("MQTT_USERNAME")
mqtt_password = setting("MQTT_PASSWORD")
mqtt_upload_topic = setting("MQTT_UPLOAD_TOPIC", "/board/upload/data")
mqtt_command_topic = setting("MQTT_COMMAND_TOPIC", "/board/get/data")

if project_dir.name == "ESP32-Automatic-Gate":
    mqtt_server = required("MQTT_SERVER")
    mqtt_username = required("MQTT_USERNAME")
    mqtt_password = required("MQTT_PASSWORD")

header = f"""#pragma once

#include <Arduino.h>

constexpr const char *WIFI_SSID = {json.dumps(wifi_ssid)};
constexpr const char *WIFI_PASSWORD = {json.dumps(wifi_password)};
constexpr const char *CAMERA_HOSTNAME = {json.dumps(camera_hostname)};
constexpr uint16_t CAMERA_STREAM_PORT = {stream_port};
constexpr const char *MQTT_SERVER = {json.dumps(mqtt_server)};
constexpr uint16_t MQTT_PORT = {mqtt_port};
constexpr const char *MQTT_USERNAME = {json.dumps(mqtt_username)};
constexpr const char *MQTT_PASSWORD = {json.dumps(mqtt_password)};
constexpr const char *MQTT_UPLOAD_TOPIC = {json.dumps(mqtt_upload_topic)};
constexpr const char *MQTT_COMMAND_TOPIC = {json.dumps(mqtt_command_topic)};
"""

generated_header.parent.mkdir(parents=True, exist_ok=True)
if not generated_header.exists() or generated_header.read_text(encoding="utf-8") != header:
    generated_header.write_text(header, encoding="utf-8")

print(f"[shared-env] Configuration loaded for {project_dir.name}")

