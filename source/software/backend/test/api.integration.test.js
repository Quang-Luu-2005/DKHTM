import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import "dotenv/config";

const enabled = process.env.RUN_INTEGRATION === "1";

function listen(server) {
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    // Undici keeps HTTP/1.1 sockets alive. Force test-only mock connections to
    // close so shutdown cannot hang while waiting for an idle pooled socket.
    server.closeAllConnections?.();
  });
}

async function waitFor(check, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for integration state");
}

function readStream(reader, timeoutMs = 3000) {
  return Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error("Timed out waiting for SSE frame")),
      timeoutMs
    ))
  ]);
}

test("PostgreSQL API, device deduplication, snapshot, SSE and command acknowledgement", { skip: !enabled }, async () => {
  process.env.DATABASE_URL ||= "postgresql://sentinel:sentinel@localhost:5432/sentinel?schema=public";
  const controller = http.createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      const command = JSON.parse(raw);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, commandId: command.commandId, hardware: command.desiredState }));
    });
  });
  const controllerPort = await listen(controller);
  process.env.CONTROLLER_URL = `http://127.0.0.1:${controllerPort}`;
  process.env.DEVICE_SECRET = "integration-secret";
  process.env.COMMAND_TIMEOUT_MS = "100";
  process.env.COMMAND_MAX_ATTEMPTS = "2";

  const [{ app }, { prisma }, { config }] = await Promise.all([
    import("../src/app.js"), import("../src/prisma.js"), import("../src/config.js")
  ]);
  const apiServer = http.createServer(app);
  const apiPort = await listen(apiServer);
  const baseUrl = `http://127.0.0.1:${apiPort}`;

  try {
    await prisma.snapshot.deleteMany();
    await prisma.deviceEvent.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.hardwareCommand.deleteMany();
    await prisma.gateHardwareState.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();
    await fs.rm(config.UPLOAD_DIR, { recursive: true, force: true });

    const user = { id: "SENT-TEST", fullName: "Integration User", role: "Technician", rfidUid: "NOT LINKED", faceIdStatus: "PENDING" };
    assert.equal((await fetch(`${baseUrl}/api/users`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(user) })).status, 200);
    assert.equal((await (await fetch(`${baseUrl}/api/users`)).json()).length, 1);

    const event = { eventId: "event-dedup-1", deviceId: "ESP32CAM_TEST", gateId: "GATE_01", source: "ESP32_CAM", eventType: "CAMERA_ONLINE", message: "Camera online", confidence: 0.9 };
    const eventOptions = { method: "POST", headers: { "content-type": "application/json", "x-device-secret": "integration-secret" }, body: JSON.stringify(event) };
    assert.equal((await fetch(`${baseUrl}/api/device/events`, eventOptions)).status, 201);
    assert.equal((await (await fetch(`${baseUrl}/api/device/events`, eventOptions)).json()).duplicate, true);
    assert.equal(await prisma.deviceEvent.count(), 1);
    assert.equal(await prisma.auditLog.count(), 1);

    const controllerTelemetry = {
      eventId: "controller-heartbeat-1",
      deviceId: config.CONTROLLER_DEVICE_ID,
      gateId: "GATE_01",
      source: "ESP32_CONTROLLER",
      eventType: "CONTROLLER_HEARTBEAT",
      message: "Controller healthy",
      hardware: {
        servoArm: "SECURED / CLOSED",
        servoLocked: true,
        indicatorLed: "RED / RESTRICTED",
        systemBuzzer: "MUTED",
        rfidReady: true,
        ultrasonicReady: true
      }
    };
    assert.equal((await fetch(`${baseUrl}/api/device/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-secret": "integration-secret" },
      body: JSON.stringify(controllerTelemetry)
    })).status, 201);
    const telemetryState = await (await fetch(`${baseUrl}/api/hardware`)).json();
    assert.equal(telemetryState.connectionStatus, "ONLINE");
    assert.equal(telemetryState.reportedState.servoLocked, true);
    assert.equal(telemetryState.servoLocked, true, "Top-level dashboard state must use controller telemetry");
    assert.ok(telemetryState.lastReportedAt);

    const snapshot = await fetch(`${baseUrl}/api/device/camera/snapshot?deviceId=ESP32CAM_TEST&gateId=GATE_01`, {
      method: "POST", headers: { "content-type": "image/jpeg", "x-device-secret": "integration-secret" }, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    });
    assert.equal(snapshot.status, 201);
    assert.equal((await fetch(`${baseUrl}/api/device/camera/snapshot/latest`)).status, 200);

    const streamAbort = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events`, { signal: streamAbort.signal });
    const streamReader = stream.body.getReader();
    const firstFrame = await readStream(streamReader);
    assert.match(Buffer.from(firstFrame.value).toString(), /event: connected/);
    const logResponse = await fetch(`${baseUrl}/api/logs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectName: "SSE test", accessMethod: "RFID", gateId: "GATE_01", status: "ONLINE", confidence: "100%" })
    });
    assert.equal(logResponse.status, 201);
    let sseFrames = "";
    await waitFor(async () => {
      const nextFrame = await readStream(streamReader);
      if (nextFrame.done) return false;
      sseFrames += Buffer.from(nextFrame.value).toString();
      return /event: audit\.log/.test(sseFrames);
    });
    assert.match(sseFrames, /event: audit\.log/);
    streamAbort.abort();
    await streamReader.cancel().catch(() => undefined);

    const desired = { servoArm: "OPENED / UNSECURED", servoLocked: false, indicatorLed: "GREEN / ACCESS ALLOWED", systemBuzzer: "MUTED" };
    const queued = await (await fetch(`${baseUrl}/api/hardware`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(desired) })).json();
    assert.equal(queued.commandStatus, "PENDING");
    const acked = await waitFor(() => prisma.hardwareCommand.findUnique({ where: { commandId: queued.commandId } }).then(command => command?.status === "ACKED" ? command : null));
    assert.equal(acked.retryCount, 1);

    await close(controller);
    const timeoutQueued = await (await fetch(`${baseUrl}/api/hardware`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...desired, servoArm: "SECURED / CLOSED", servoLocked: true }) })).json();
    const timedOut = await waitFor(() => prisma.hardwareCommand.findUnique({ where: { commandId: timeoutQueued.commandId } }).then(command => command?.status === "TIMEOUT" ? command : null));
    assert.equal(timedOut.retryCount, 2);
  } finally {
    await close(controller);
    await close(apiServer);
    await prisma.snapshot.deleteMany();
    await prisma.deviceEvent.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.hardwareCommand.deleteMany();
    await prisma.gateHardwareState.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();
    await fs.rm(config.UPLOAD_DIR, { recursive: true, force: true });
    await prisma.$disconnect();
  }
});
