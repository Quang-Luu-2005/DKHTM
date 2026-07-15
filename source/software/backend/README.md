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

## Tests

```powershell
npm test
```

The PostgreSQL integration test is opt-in after the database is running:

```powershell
$env:RUN_INTEGRATION="1"
npm test
```
