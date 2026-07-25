# Sentinel backend

The backend uses Express, Prisma and PostgreSQL. It exposes the dashboard REST API on
port `3001`, receives authenticated ESP32-CAM events, stores JPEG snapshot metadata and
publishes realtime changes through `GET /api/events` (SSE).

## Local development

```powershell
Copy-Item .env.example .env
npm install
docker compose --env-file .env -f ../../docker-compose.yml up -d postgres
npm run prisma:deploy
npm run dev
```

Set `CONTROLLER_URL` in `.env` to the main controller's LAN address before testing
hardware commands. `DEVICE_SECRET` must match the ESP32-CAM configuration.

Set `CAMERA_URL` to the ESP32-CAM LAN address before enrolling a portrait. Face
enrollment uses one multipart request:

```text
POST /api/users/enroll
Content-Type: multipart/form-data

id=<employee id>
fullName=<display name>
role=<one of the dashboard roles>
rfidUid=<optional UID>
portrait=<JPEG, PNG, or WebP file>
```

The backend normalizes the image to a 320x240 JPEG and sends it as a raw
`image/jpeg` body to `POST ${CAMERA_URL}/face/embedding`, authenticated by
`x-device-secret`. The canonical camera response contains `ok`, model identifier
`FaceRecognition112V1S8`, the actual embedding `dimension`, and a numeric
L2-normalized `vector` of exactly that length.

The normalized portrait and model-versioned embedding are committed together in
PostgreSQL (the real dimension is supplied by the model). `GET
/api/users/:id/portrait` serves the stored portrait; deleting
the user cascades the `FaceProfile` row and removes its portrait file.

Runtime Face ID is proximity gated. A device first posts
`PRESENCE_DETECTED` for a gate, then the camera posts `FACE_EMBEDDING` with
`model`, `dimension`, and `vector` before `FACE_PRESENCE_WINDOW_MS` expires.
The backend performs cosine matching against enrolled profiles and grants only
at or above `FACE_MATCH_THRESHOLD`. Runtime vectors are never stored in
`DeviceEvent`; probes outside the presence window only refresh device liveness.
Legacy `FACE_RECOGNIZED` claims are fail-closed and can no longer grant access.

## Tests

```powershell
npm test
```

The scoped face-flow integration test is opt-in after the database is running:

```powershell
$env:RUN_INTEGRATION="1"
node --test --test-concurrency=1 test/face-flow.test.js
```

`test/api.integration.test.js` clears whole test tables. Run it only against a
dedicated disposable database, never a database containing real registrations.
