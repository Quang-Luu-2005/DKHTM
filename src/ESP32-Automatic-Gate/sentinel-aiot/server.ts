import dotenv from "dotenv";
import express, { type Response } from "express";
import mqtt from "mqtt";
import nodemailer from "nodemailer";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
      "Create sentinel-aiot/.env.local from .env.example.",
  );
}

const mqttUrl = process.env.MQTT_URL!;
const mqttUploadTopic = process.env.MQTT_UPLOAD_TOPIC || "/board/upload/data";
const mqttCommandTopic = process.env.MQTT_COMMAND_TOPIC || "/board/get/data";
const serverPort = Number(process.env.SERVER_PORT || 3001);
const enrollmentWindowMs = 30_000;
const maxLocalRfidRecords = 20;
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
  faceIdStatus: "ENROLLED" | "PENDING";
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
    typeof user.rfidUid === "string" &&
    (user.faceIdStatus === undefined ||
      user.faceIdStatus === "ENROLLED" || user.faceIdStatus === "PENDING")
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
let activeFaceEnrollment: { employeeId: string; expiresAt: number } | null = null;
let rfidRegistryVersion = Math.floor(Date.now() / 1000) >>> 0;

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

const app = express();
const eventClients = new Set<Response>();

app.use(express.json({ limit: "16kb" }));

function broadcast(event: string, payload: unknown) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) client.write(frame);
}

function publishRfidRegistry() {
  if (!mqttClient.connected) return false;
  const cards = registeredUsers
    .filter((user) => user.rfidUid !== "NOT LINKED")
    .map((user) => ({
      uid: normalizeRfidUid(user.rfidUid),
      employeeId: user.id,
      employeeName: user.fullName,
    }));
  const payload = JSON.stringify({
    action: "rfid_registry_replace",
    version: rfidRegistryVersion,
    cards,
  });
  mqttClient.publish(mqttCommandTopic, payload, { qos: 1, retain: true }, (error) => {
    if (error) {
      console.error(`[RFID] Registry sync failed: ${error.message}`);
    } else {
      console.log(`[RFID] Registry sync queued: ${cards.length} local records`);
    }
  });
  return true;
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
  const eventType = typeof payload.eventType === "string" ? payload.eventType : "";
  const authMethod = typeof payload.authMethod === "string"
    ? payload.authMethod.toUpperCase()
    : payload.access_method === "face" ? "FACE" : "RFID";
  const isFaceAccess = authMethod === "FACE";
  const rfidUid = typeof payload.rfid_uid === "string" ? payload.rfid_uid : "Không xác định";
  const eventTime = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const gateId = typeof payload.gate_id === "string" ? payload.gate_id : "GT-NORTH-01";

  if (eventType === "AUTH_SUCCESS" || result === "granted") {
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

  // Individual failures and camera retries are logged on the web only. Email is
  // sent once, after the board reports the third countable failure in a session.
  if (eventType === "AUTH_FAILURE" || eventType === "AUTH_RETRY" || result === "denied") {
    return 0;
  }

  if (eventType === "AUTHENTICATION_ALERT") {
    const recipients = securityNotificationRecipients();
    if (recipients.length === 0) {
      console.warn("[EMAIL] Authentication alert has no Administrator or Security Officer recipient");
    }
    return sendNotification(
      recipients,
      "[Sentinel] CẢNH BÁO XÁC THỰC BẤT THƯỜNG",
      [
        "Hệ thống ghi nhận nhiều lần xác thực không hợp lệ trong cùng một phiên.",
        `Thời gian: ${eventTime}`,
        `Cổng: ${gateId}`,
        `Phương thức: ${authMethod}`,
        `Loại cảnh báo: ${String(payload.alertType || "REPEATED_AUTH_FAILURE")}`,
        `Số lần thất bại: ${Number(payload.failedAttempts || 3)}`,
        "Trạng thái cổng: Đang khóa.",
        "",
        "Đây là cảnh báo xác thực bất thường, không phải xác nhận có hành vi vượt cổng.",
      ].join("\n"),
    );
  }

  if (eventType === "FORCED_LOCK_PRESENCE_ALERT") {
    const recipients = securityNotificationRecipients();
    if (recipients.length === 0) {
      console.warn("[EMAIL] Forced-lock presence alert has no Administrator or Security Officer recipient");
    }
    return sendNotification(
      recipients,
      "[Sentinel] CẢNH BÁO CÓ NGƯỜI TẠI CỔNG ĐANG KHÓA CƯỠNG BỨC",
      [
        "HC-SR04 phát hiện có người hoặc vật thể tiến vào vùng cổng đang khóa cưỡng bức.",
        `Thời gian: ${eventTime}`,
        `Cổng: ${gateId}`,
        "Trạng thái cổng: Đang khóa cưỡng bức.",
        "Cảnh báo chỉ được gửi một lần cho đến khi vùng cảm biến trống trở lại.",
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
    if (registeredUsers.length > 0) publishRfidRegistry();
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
    const receivedAt = new Date().toISOString();
    if (typeof payload.timestamp !== "string") payload.timestamp = receivedAt;

    // ESP32-CAM stores only the employee ID with each embedding. Resolve the
    // display name at the trusted server boundary before forwarding the event
    // to browsers or composing notification emails.
    if (typeof payload.employee_id === "string") {
      const employee = registeredUsers.find(
        (user) => user.id === payload.employee_id,
      );
      if (employee &&
          (typeof payload.employee_name !== "string" ||
           payload.employee_name.length === 0 ||
           payload.employee_name === payload.employee_id)) {
        payload.employee_name = employee.fullName;
      }
    }
    broadcast("board-event", { topic, payload, receivedAt });

    if (payload.event === "gate_event" || payload.event === "authentication_alert" || payload.event === "forced_lock_alert") {
      void notifyGateEvent(payload).catch((error: Error) => {
        console.error(`[EMAIL] Notification error: ${error.message}`);
      });
    }

    if (payload.event === "face_enrollment" &&
        typeof payload.employee_id === "string" &&
        typeof payload.status === "string") {
      const employeeId = payload.employee_id;
      const status = payload.status.toUpperCase();
      if (status === "SUCCESS") {
        registeredUsers = registeredUsers.map((user) =>
          user.id === employeeId ? { ...user, faceIdStatus: "ENROLLED" } : user,
        );
        persistRegisteredUsers(registeredUsers);
      }
      if (status === "SUCCESS" || status === "FAILED") {
        activeFaceEnrollment = null;
      }
      return;
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

    if (payload.authorizationMode === "LOCAL") {
      console.log(`[RFID] Local board decision received for ${rfidUid}`);
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
  });
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
    faceIdStatus: (
      (user.faceIdStatus === "ENROLLED" ? "ENROLLED" : "PENDING") as
        RegisteredUser["faceIdStatus"]
    ),
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

  if (linkedUids.length > maxLocalRfidRecords) {
    response.status(422).json({
      error: `ESP32 chỉ lưu tối đa ${maxLocalRfidRecords} thẻ RFID cục bộ`,
    });
    return;
  }
  if (normalizedUsers.some((user) =>
    user.id.length === 0 || user.id.length >= 32 ||
    user.fullName.length >= 64 ||
    (user.rfidUid !== "NOT LINKED" && user.rfidUid.length >= 32)
  )) {
    response.status(422).json({ error: "ID, tên hoặc UID vượt giới hạn lưu trữ của ESP32" });
    return;
  }

  registeredUsers = normalizedUsers;
  persistRegisteredUsers(registeredUsers);
  rfidRegistryVersion = (rfidRegistryVersion + 1) >>> 0;
  const boardSyncQueued = publishRfidRegistry();
  response.json({ saved: true, count: registeredUsers.length, boardSyncQueued });
});

app.post("/api/enrollment/start", (_request, response) => {
  if (!mqttClient.connected) {
    response.status(503).json({ error: "MQTT broker is not connected" });
    return;
  }

  enrollmentExpiresAt = Date.now() + enrollmentWindowMs;
  mqttClient.publish(
    mqttCommandTopic,
    JSON.stringify({ action: "rfid_enrollment_start" }),
    { qos: 1, retain: false },
  );
  response.status(202).json({ accepted: true, expiresInMs: enrollmentWindowMs });
});

app.post("/api/face-enrollment/start", (request, response) => {
  if (!mqttClient.connected) {
    response.status(503).json({ error: "MQTT broker is not connected" });
    return;
  }

  const employeeId = typeof request.body?.employeeId === "string"
    ? request.body.employeeId.trim()
    : "";
  const employee = registeredUsers.find((user) => user.id === employeeId);
  if (!employee) {
    response.status(404).json({ error: "Nhân viên chưa được lưu trong hệ thống" });
    return;
  }
  if (employeeId.length === 0 || employeeId.length > 24) {
    response.status(422).json({ error: "Mã nhân viên phải có từ 1 đến 24 ký tự" });
    return;
  }
  if (activeFaceEnrollment && activeFaceEnrollment.expiresAt > Date.now()) {
    response.status(409).json({
      error: `Camera đang đăng ký khuôn mặt cho ${activeFaceEnrollment.employeeId}`,
    });
    return;
  }

  activeFaceEnrollment = {
    employeeId,
    expiresAt: Date.now() + 75_000,
  };
  mqttClient.publish(
    mqttCommandTopic,
    JSON.stringify({ action: "face_enrollment_start", employee_id: employeeId }),
    { qos: 1, retain: false },
    (error) => {
      if (error) {
        activeFaceEnrollment = null;
        console.error(`[FACE] Enrollment command failed: ${error.message}`);
      } else {
        console.log(`[FACE] Enrollment requested for ${employeeId}`);
      }
    },
  );
  response.status(202).json({ accepted: true, employeeId });
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
