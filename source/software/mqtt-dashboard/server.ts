import dotenv from "dotenv";
import express, { type Response } from "express";
import mqtt from "mqtt";
import nodemailer from "nodemailer";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

dotenv.config({ path: path.join(currentDir, ".env.local") });
dotenv.config({ path: path.join(currentDir, ".env") });

const requiredEnvironment = [
  "MQTT_URL",
  "MQTT_USERNAME",
  "MQTT_PASSWORD",
] as const;

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
  throw new Error(
    `Missing MQTT environment variables: ${missingEnvironment.join(", ")}. ` +
      "Create software/mqtt-dashboard/.env.local from .env.example.",
  );
}

const mqttUrl = process.env.MQTT_URL!;
const mqttUploadTopic = process.env.MQTT_UPLOAD_TOPIC || "/board/upload/data";
const mqttCommandTopic = process.env.MQTT_COMMAND_TOPIC || "/board/get/data";
const serverPort = Number(process.env.SERVER_PORT || 3001);
const cameraControlUrl = new URL(process.env.ESP32_CAM_URL || "http://sentinel-cam.local");
const cameraStreamUrl = new URL(
  process.env.ESP32_CAM_STREAM_URL || "http://sentinel-cam.local:81/stream",
);
const enrollmentWindowMs = 30_000;
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === "true"
  : smtpPort === 465;
const smtpEnabled = Boolean(
  process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM,
);

interface RegisteredUser {
  id: string;
  fullName: string;
  email?: string;
  role: string;
  rfidUid: string;
}

const databaseDirectory = path.join(currentDir, ".sentinel-data");
const usersDatabasePath = path.join(databaseDirectory, "users.json");

function normalizeRfidUid(uid: string) {
  return uid.trim().toUpperCase().replaceAll("-", ":");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isRegisteredUser(value: unknown): value is RegisteredUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<RegisteredUser>;
  return (
    typeof user.id === "string" &&
    typeof user.fullName === "string" &&
    (user.email === undefined || typeof user.email === "string") &&
    typeof user.role === "string" &&
    typeof user.rfidUid === "string"
  );
}

function loadRegisteredUsers(): RegisteredUser[] {
  try {
    const stored = JSON.parse(readFileSync(usersDatabasePath, "utf8")) as unknown;
    return Array.isArray(stored) ? stored.filter(isRegisteredUser) : [];
  } catch {
    return [];
  }
}

function persistRegisteredUsers(users: RegisteredUser[]) {
  mkdirSync(databaseDirectory, { recursive: true });
  const temporaryPath = `${usersDatabasePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, usersDatabasePath);
}

let registeredUsers = loadRegisteredUsers();
let enrollmentExpiresAt = 0;

const mailTransporter = smtpEnabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  : null;

if (mailTransporter) {
  void mailTransporter.verify().then(
    () => console.log("[EMAIL] SMTP connection verified"),
    (error: Error) => console.error(`[EMAIL] SMTP verification failed: ${error.message}`),
  );
} else {
  console.log("[EMAIL] Notifications disabled; SMTP environment variables are incomplete");
}

const allowedActions = new Set([
  "open",
  "close",
  "normal",
  "led_green",
  "led_red",
  "buzzer_on",
  "buzzer_off",
  "reset_violation",
]);

const app = express();
const eventClients = new Set<Response>();

app.use(express.json({ limit: "16kb" }));

function broadcast(event: string, payload: unknown) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) client.write(frame);
}

function proxyCameraRequest(target: URL, response: Response) {
  const client = target.protocol === "https:" ? https : http;
  let upstreamResponseRef: http.IncomingMessage | null = null;
  const upstreamRequest = client.get(target, (upstreamResponse) => {
    upstreamResponseRef = upstreamResponse;
    if (!upstreamResponse.statusCode || upstreamResponse.statusCode >= 400) {
      response.status(502).json({ error: `ESP32-CAM returned HTTP ${upstreamResponse.statusCode}` });
      upstreamResponse.resume();
      return;
    }

    response.status(upstreamResponse.statusCode);
    for (const header of ["content-type", "content-length", "cache-control"]) {
      const value = upstreamResponse.headers[header];
      if (value) response.setHeader(header, value);
    }
    upstreamResponse.pipe(response);
  });

  upstreamRequest.setTimeout(10_000, () => {
    upstreamRequest.destroy(new Error("ESP32-CAM request timed out"));
  });
  upstreamRequest.on("error", (error) => {
    if (!response.headersSent) {
      response.status(502).json({ error: `ESP32-CAM unavailable: ${error.message}` });
    } else {
      response.end();
    }
  });
  response.on("close", () => {
    upstreamResponseRef?.destroy();
    upstreamRequest.destroy();
  });
}

function securityNotificationRecipients() {
  const validEmails = (users: RegisteredUser[]) => [...new Set(
    users
      .map((user) => user.email?.trim().toLowerCase() || "")
      .filter(isValidEmail),
  )];

  const securityEmails = validEmails(
    registeredUsers.filter(
      (user) => {
        const role = user.role.trim().toLowerCase();
        return role === "administrator" || role === "security officer";
      },
    ),
  );
  return securityEmails;
}

async function sendNotification(recipients: string[], subject: string, text: string) {
  if (!mailTransporter || recipients.length === 0) return 0;

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      mailTransporter.sendMail({
        from: process.env.SMTP_FROM,
        to: recipient,
        subject,
        text,
      }),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`[EMAIL] Notification sent to ${recipients[index]}`);
    } else {
      console.error(`[EMAIL] Failed for ${recipients[index]}: ${result.reason}`);
    }
  });
  return results.filter((result) => result.status === "fulfilled").length;
}

async function notifyGateEvent(payload: Record<string, unknown>) {
  const result = typeof payload.result === "string" ? payload.result.toLowerCase() : "";
  const isFaceAccess = payload.access_method === "face";
  const rfidUid = typeof payload.rfid_uid === "string" ? payload.rfid_uid : "Không xác định";
  const eventTime = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const gateId = typeof payload.gate_id === "string" ? payload.gate_id : "GT-NORTH-01";

  if (result === "granted") {
    const employeeId = typeof payload.employee_id === "string" ? payload.employee_id : "";
    const employee = registeredUsers.find(
      (user) =>
        user.id === employeeId ||
        (user.rfidUid !== "NOT LINKED" && normalizeRfidUid(user.rfidUid) === normalizeRfidUid(rfidUid)),
    );
    if (!employee?.email || !isValidEmail(employee.email)) return;

    return sendNotification(
      [employee.email],
      "[Sentinel] Đã xác nhận quyền ra vào",
      [
        `Xin chào ${employee.fullName},`,
        "",
        isFaceAccess
          ? "Khuôn mặt của bạn vừa được nhận diện và cổng đã mở."
          : "Thẻ RFID của bạn vừa được chấp nhận và cổng đã mở.",
        `Mã nhân viên: ${employee.id}`,
        `Thời gian: ${eventTime}`,
        `Cổng: ${gateId}`,
        "",
        "Nếu đây không phải là bạn, hãy báo ngay cho bộ phận an ninh.",
      ].join("\n"),
    );
  }

  if (result === "denied") {
    return sendNotification(
      securityNotificationRecipients(),
      isFaceAccess
        ? "[Sentinel] Cảnh báo khuôn mặt không khớp"
        : "[Sentinel] Cảnh báo thẻ RFID không hợp lệ",
      [
        isFaceAccess
          ? "Hệ thống vừa từ chối một khuôn mặt không khớp database."
          : "Hệ thống vừa từ chối một yêu cầu ra vào bằng RFID.",
        ...(isFaceAccess ? [] : [`UID: ${rfidUid}`]),
        `Lý do: ${String(payload.reason || "not_registered")}`,
        `Thời gian: ${eventTime}`,
        `Cổng: ${gateId}`,
      ].join("\n"),
    );
  }

  if (result === "violated") {
    const incidentDetails = typeof payload.details === "string"
      ? payload.details
      : "ESP32 vừa phát hiện hành động vượt cổng hoặc xâm nhập.";
    const recipients = securityNotificationRecipients();
    if (recipients.length === 0) {
      console.warn("[EMAIL] Violation detected but no Administrator or Security Officer email is registered");
    }
    return sendNotification(
      recipients,
      "[Sentinel] CẢNH BÁO VI PHẠM TẠI CỔNG",
      [
        incidentDetails,
        `Thời gian: ${eventTime}`,
        `Cổng: ${gateId}`,
        "Trạng thái: Cổng đã khóa và buzzer đang hoạt động.",
        "Vui lòng kiểm tra ngay.",
      ].join("\n"),
    );
  }

  return 0;
}

const mqttClient = mqtt.connect(mqttUrl, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: `sentinel-web-${Math.random().toString(16).slice(2, 10)}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 15000,
});

mqttClient.on("connect", () => {
  console.log(`[MQTT] Connected to ${new URL(mqttUrl).hostname}`);
  mqttClient.subscribe(mqttUploadTopic, { qos: 0 }, (error) => {
    if (error) {
      console.error(`[MQTT] Subscribe failed: ${error.message}`);
      return;
    }
    console.log(`[MQTT] Subscribed to ${mqttUploadTopic}`);
  });
  broadcast("broker-status", { connected: true });
});

mqttClient.on("reconnect", () => {
  broadcast("broker-status", { connected: false, reconnecting: true });
});

mqttClient.on("close", () => {
  broadcast("broker-status", { connected: false });
});

mqttClient.on("error", (error) => {
  console.error(`[MQTT] ${error.message}`);
  broadcast("broker-status", { connected: false, error: error.message });
});

mqttClient.on("message", (topic, payloadBuffer) => {
  const rawPayload = payloadBuffer.toString("utf8");
  try {
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;
    broadcast("board-event", { topic, payload, receivedAt: new Date().toISOString() });

    if (payload.event === "gate_event") {
      void notifyGateEvent(payload).catch((error: Error) => {
        console.error(`[EMAIL] Notification error: ${error.message}`);
      });
    }

    if (payload.event !== "rfid_scan" || typeof payload.rfid_uid !== "string") {
      return;
    }

    const rfidUid = normalizeRfidUid(payload.rfid_uid);
    const enrollmentActive = Date.now() <= enrollmentExpiresAt;

    if (enrollmentActive) {
      enrollmentExpiresAt = 0;
      broadcast("rfid-enrollment", {
        rfidUid,
        receivedAt: new Date().toISOString(),
      });
      mqttClient.publish(
        mqttCommandTopic,
        JSON.stringify({
          action: "rfid_result",
          authorized: false,
          silent: true,
          reason: "enrollment",
          rfid_uid: rfidUid,
        }),
      );
      console.log(`[RFID] Enrollment captured ${rfidUid}`);
      return;
    }

    const matchedUser = registeredUsers.find(
      (user) =>
        user.rfidUid !== "NOT LINKED" &&
        normalizeRfidUid(user.rfidUid) === rfidUid,
    );

    mqttClient.publish(
      mqttCommandTopic,
      JSON.stringify({
        action: "rfid_result",
        authorized: Boolean(matchedUser),
        silent: false,
        reason: matchedUser ? "registered" : "not_registered",
        rfid_uid: rfidUid,
        employee_id: matchedUser?.id || "",
        employee_name: matchedUser?.fullName || "",
      }),
    );

    if (matchedUser) {
      console.log(`[RFID] Granted ${rfidUid} to ${matchedUser.fullName}`);
    } else {
      console.warn(`[RFID] Denied unregistered card ${rfidUid}`);
    }
  } catch {
    console.warn(`[MQTT] Ignored invalid JSON on ${topic}`);
  }
});

app.get("/api/status", (_request, response) => {
  response.json({
    mqttConnected: mqttClient.connected,
    uploadTopic: mqttUploadTopic,
    commandTopic: mqttCommandTopic,
    registeredUsers: registeredUsers.length,
    emailNotificationsEnabled: smtpEnabled,
    cameraControlUrl: cameraControlUrl.toString(),
  });
});

app.get("/api/camera/status", (_request, response) => {
  proxyCameraRequest(new URL("/status", cameraControlUrl), response);
});

app.get("/api/camera/capture", (_request, response) => {
  const captureUrl = new URL("/capture", cameraControlUrl);
  captureUrl.searchParams.set("timestamp", String(Date.now()));
  proxyCameraRequest(captureUrl, response);
});

app.get("/api/camera/stream", (_request, response) => {
  proxyCameraRequest(cameraStreamUrl, response);
});

app.post("/api/camera/flash", (request, response) => {
  const enabled = request.body?.enabled;
  if (typeof enabled !== "boolean") {
    response.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  const flashUrl = new URL("/flash", cameraControlUrl);
  flashUrl.searchParams.set("enabled", enabled ? "1" : "0");
  proxyCameraRequest(flashUrl, response);
});

app.put("/api/users", (request, response) => {
  const users = request.body?.users;
  if (!Array.isArray(users) || !users.every(isRegisteredUser)) {
    response.status(400).json({ error: "Invalid users database" });
    return;
  }

  const normalizedUsers = users.map((user) => ({
    id: user.id.trim(),
    fullName: user.fullName.trim(),
    email: user.email?.trim().toLowerCase() || "",
    role: user.role.trim(),
    rfidUid:
      user.rfidUid === "NOT LINKED"
        ? "NOT LINKED"
        : normalizeRfidUid(user.rfidUid),
  }));
  const linkedUids = normalizedUsers
    .map((user) => user.rfidUid)
    .filter((uid) => uid !== "NOT LINKED");

  if (normalizedUsers.some((user) => user.email && !isValidEmail(user.email))) {
    response.status(400).json({ error: "Có địa chỉ email nhân viên không hợp lệ" });
    return;
  }

  if (new Set(linkedUids).size !== linkedUids.length) {
    response.status(409).json({ error: "Một mã thẻ đang được gán cho nhiều nhân viên" });
    return;
  }

  registeredUsers = normalizedUsers;
  persistRegisteredUsers(registeredUsers);
  response.json({ saved: true, count: registeredUsers.length });
});

app.post("/api/enrollment/start", (_request, response) => {
  if (!mqttClient.connected) {
    response.status(503).json({ error: "MQTT broker is not connected" });
    return;
  }

  enrollmentExpiresAt = Date.now() + enrollmentWindowMs;
  response.status(202).json({ accepted: true, expiresInMs: enrollmentWindowMs });
});

app.post("/api/incidents", async (request, response) => {
  const gateId = typeof request.body?.gateId === "string" ? request.body.gateId : "GT-NORTH-01";
  const details = typeof request.body?.details === "string"
    ? request.body.details
    : "Sự kiện vi phạm được kích hoạt từ giao diện Sentinel.";

  try {
    const notified = await notifyGateEvent({
      event: "gate_event",
      result: "violated",
      gate_id: gateId,
      details,
    });
    response.status(202).json({ accepted: true, notified });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email notification failed";
    response.status(502).json({ error: message });
  }
});

app.post("/api/face-results", (request, response) => {
  const authorized = request.body?.authorized;
  const requestId = request.body?.requestId;
  if (typeof authorized !== "boolean" || typeof requestId !== "string" || !requestId) {
    response.status(400).json({ error: "Invalid face recognition result" });
    return;
  }
  if (!mqttClient.connected) {
    response.status(503).json({ error: "MQTT broker is not connected" });
    return;
  }

  const payload = JSON.stringify({
    action: "face_result",
    authorized,
    request_id: requestId,
    employee_id: typeof request.body.employeeId === "string" ? request.body.employeeId : "",
    employee_name: typeof request.body.employeeName === "string" ? request.body.employeeName : "",
    confidence: typeof request.body.confidence === "number" ? request.body.confidence : 0,
    reason: typeof request.body.reason === "string"
      ? request.body.reason
      : authorized ? "face_matched" : "face_not_matched",
  });

  mqttClient.publish(mqttCommandTopic, payload, { qos: 0 }, (error) => {
    if (error) {
      response.status(502).json({ error: error.message });
      return;
    }
    response.status(202).json({ accepted: true, requestId });
  });
});

app.get("/api/events", (request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();

  eventClients.add(response);
  response.write(
    `event: broker-status\ndata: ${JSON.stringify({ connected: mqttClient.connected })}\n\n`,
  );

  request.on("close", () => eventClients.delete(response));
});

app.post("/api/commands", (request, response) => {
  const action = request.body?.action;
  if (typeof action !== "string" || !allowedActions.has(action)) {
    response.status(400).json({ error: "Unsupported board action" });
    return;
  }

  if (!mqttClient.connected) {
    response.status(503).json({ error: "MQTT broker is not connected" });
    return;
  }

  const payload = JSON.stringify({ action, source: "sentinel-web" });
  mqttClient.publish(mqttCommandTopic, payload, { qos: 0 }, (error) => {
    if (error) {
      response.status(502).json({ error: error.message });
      return;
    }
    response.status(202).json({ accepted: true, action });
  });
});

const staticDirectory = path.join(currentDir, "dist");
app.use(express.static(staticDirectory));
app.get("*", (request, response, next) => {
  if (request.path.startsWith("/api/")) {
    next();
    return;
  }
  response.sendFile(path.join(staticDirectory, "index.html"));
});

const keepAliveTimer = setInterval(() => {
  for (const client of eventClients) client.write(": keep-alive\n\n");
}, 20000);
keepAliveTimer.unref();

app.listen(serverPort, () => {
  console.log(`[Sentinel] API listening on http://localhost:${serverPort}`);
});
