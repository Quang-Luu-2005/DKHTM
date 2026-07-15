import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3001);
const deviceSecret = process.env.DEVICE_SECRET || "demo-secret";
const controllerUrl = (process.env.CONTROLLER_URL || "").replace(/\/$/, "");
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "data");
const uploadDir = path.join(root, "uploads");
const dbFile = path.join(dataDir, "sentinel.json");
const initialHardware = {
  servoArm: "SECURED / CLOSED",
  servoLocked: true,
  indicatorLed: "RED / RESTRICTED",
  systemBuzzer: "MUTED"
};

let db = { users: [], logs: [], hardware: initialHardware, devices: {}, latestSnapshot: null };
let writeQueue = Promise.resolve();

async function persist() {
  writeQueue = writeQueue.then(() => fs.writeFile(dbFile, JSON.stringify(db, null, 2), "utf8"));
  return writeQueue;
}

async function init() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
  try {
    db = { ...db, ...JSON.parse(await fs.readFile(dbFile, "utf8")) };
  } catch {
    await persist();
  }
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-device-secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "1mb" }));

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function requireDevice(req, res, next) {
  if (req.get("x-device-secret") !== deviceSecret) return res.status(401).json({ error: "Invalid device secret" });
  next();
}
function createLog(input) {
  return { ...input, id: input.id || `log-${Date.now()}`, timestamp: input.timestamp || now() };
}
async function forwardToController(command) {
  if (!controllerUrl) return { forwarded: false };
  try {
    const response = await fetch(`${controllerUrl}/api/hardware/command`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command })
    });
    return { forwarded: response.ok };
  } catch {
    return { forwarded: false };
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true, controllerConfigured: Boolean(controllerUrl) }));
app.get("/api/users", (_req, res) => res.json(db.users));
app.post("/api/users", async (req, res) => {
  if (!req.body?.id || !req.body?.fullName) return res.status(400).json({ error: "id and fullName are required" });
  const index = db.users.findIndex((user) => user.id === req.body.id);
  if (index >= 0) db.users[index] = req.body; else db.users.unshift(req.body);
  await persist();
  res.status(index >= 0 ? 200 : 201).json(req.body);
});
app.delete("/api/users/:id", async (req, res) => {
  db.users = db.users.filter((user) => user.id !== req.params.id);
  await persist();
  res.sendStatus(204);
});

app.get("/api/logs", (_req, res) => res.json(db.logs));
app.post("/api/logs", async (req, res) => {
  const log = createLog(req.body || {});
  db.logs.unshift(log);
  db.logs = db.logs.slice(0, 500);
  await persist();
  res.status(201).json(log);
});

app.get("/api/hardware", (_req, res) => res.json(db.hardware));
app.put("/api/hardware", async (req, res) => {
  db.hardware = { ...db.hardware, ...(req.body || {}) };
  const command = db.hardware.servoLocked ? "lock" : "grant";
  const forwarded = await forwardToController(command);
  await persist();
  res.json({ ...db.hardware, ...forwarded });
});
app.post("/api/hardware/command", async (req, res) => {
  const command = String(req.body?.command || "").toLowerCase();
  const states = {
    lock: { servoArm: "SECURED / CLOSED", servoLocked: true, indicatorLed: "RED / RESTRICTED", systemBuzzer: "MUTED" },
    grant: { servoArm: "OPENED / UNSECURED", servoLocked: false, indicatorLed: "GREEN / ACCESS ALLOWED", systemBuzzer: "MUTED" },
    deny: { servoArm: "SECURED / CLOSED", servoLocked: true, indicatorLed: "RED / RESTRICTED", systemBuzzer: "ACTIVE" },
    idle: { systemBuzzer: "MUTED" }
  };
  if (!states[command]) return res.status(400).json({ error: "Unknown command" });
  db.hardware = { ...db.hardware, ...states[command] };
  await persist();
  res.json({ ok: true, hardware: db.hardware });
});

app.post("/api/device/events", requireDevice, async (req, res) => {
  const event = { ...req.body, receivedAt: now() };
  if (event.deviceId) db.devices[event.deviceId] = { ...db.devices[event.deviceId], ...event };
  db.logs.unshift(createLog({ subjectName: event.message || event.eventType || "Device event", accessMethod: "Manual Override", gateId: event.doorId || "UNKNOWN", status: event.eventType?.includes("FAILED") ? "VIOLATION" : "ONLINE", confidence: event.confidence ? `${Math.round(event.confidence * 100)}%` : "N/A" }));
  await persist();
  res.status(201).json({ ok: true });
});
app.post("/api/device/camera/snapshot", requireDevice, express.raw({ type: "image/jpeg", limit: "8mb" }), async (req, res) => {
  const filename = `${Date.now()}.jpg`;
  await fs.writeFile(path.join(uploadDir, filename), req.body);
  db.latestSnapshot = { filename, deviceId: req.query.deviceId, doorId: req.query.doorId, receivedAt: now() };
  await persist();
  res.status(201).json({ ok: true, url: `/api/device/camera/snapshot/latest` });
});
app.get("/api/device/camera/snapshot/latest", async (_req, res) => {
  if (!db.latestSnapshot) return res.sendStatus(404);
  res.sendFile(path.join(uploadDir, db.latestSnapshot.filename));
});
app.get("/api/device/:id", (req, res) => res.json(db.devices[req.params.id] || { deviceId: req.params.id, online: false }));

await init();
app.listen(port, "0.0.0.0", () => console.log(`Sentinel backend listening on http://0.0.0.0:${port}`));
