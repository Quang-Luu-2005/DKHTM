# Sentinel access control

The reorganized project has three connected parts:

- `software/frontend`: React/Vite control panel (port `3000`)
- `software/backend`: REST bridge and persistent event store (port `3001`)
- `hardware`: ESP32-CAM and ESP32 main-controller firmware

## Run locally

Start PostgreSQL and the backend with Docker Compose:

```powershell
Copy-Item software/backend/.env.example software/backend/.env
docker compose --env-file software/backend/.env up -d postgres
cd software/backend
npm install
npm run prisma:deploy
npm run dev
```

The complete backend + PostgreSQL stack can also be started with
`docker compose --env-file software/backend/.env up -d`.
The backend exposes REST and SSE on port `3001`.

The frontend runs in a second terminal:

```powershell
cd software/frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:3001`. To use a separately hosted backend, set
`VITE_API_URL` in `software/frontend/.env.local`.
Set `VITE_CAMERA_URL` to the ESP32-CAM IP to replace the dashboard's placeholder image
with the live MJPEG stream.

## Connect the boards

1. Set Wi-Fi credentials in both `hardware/esp32cam_node/config.h` and
   `hardware/main_controller/main_controller.ino`.
2. Start the backend and set `CONTROLLER_URL` in `software/backend/.env` to the URL
   printed by the main controller (for example `http://192.168.1.51`).
3. Set `kServerBaseUrl` in `hardware/esp32cam_node/config.h` to the LAN address of the
   backend machine on port `3001` (never `localhost` from an ESP32).
4. Keep `DEVICE_SECRET` in the backend equal to `kDeviceSecret` in the ESP32-CAM config.
5. Build firmware:

```powershell
pio run -e esp32_main_controller
pio run -e esp32cam_node
```

ESP32-CAM sends device events to `/api/device/events` and JPEG snapshots to
`/api/device/camera/snapshot`. Dashboard commands are stored by the backend and forwarded
to the main controller at `/api/hardware/command` when `CONTROLLER_URL` is configured.

When SSE is temporarily unavailable, the frontend falls back to REST synchronization. User,
log and hardware records are no longer seeded from browser localStorage.
