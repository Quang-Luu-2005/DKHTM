import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import express, { type Response } from "express";
import mqtt from "mqtt";
import nodemailer from "nodemailer";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

dotenv.config({ path: path.resolve(currentDir, "..", "..", "..", ".env"), override: true });
dotenv.config({ path: path.join(currentDir, "..", ".env.local") });
dotenv.config({ path: path.join(currentDir, "..", ".env") });

const mqttUrl = process.env.MQTT_URL || (process.env.MQTT_SERVER
  ? `mqtts://${process.env.MQTT_SERVER}:${process.env.MQTT_PORT || "8883"}`
  : "");

const mqttUploadTopic = process.env.MQTT_UPLOAD_TOPIC || "/board/upload/data";
const mqttCommandTopic = process.env.MQTT_COMMAND_TOPIC || "/board/get/data";
const cameraStreamUrl = process.env.CAMERA_STREAM_URL ||
  `http://${process.env.CAMERA_HOSTNAME || "sentinel-stream-cam"}.local:${process.env.STREAM_PORT || "81"}/stream`;
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
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  : null;
const snapshotBucketName = "security-snapshots";
let supabaseHealthy = false;

interface RegisteredUser {
  id: string;
  fullName: string;
  email?: string;
  role: string;
  rfidUid: string;
  faceIdStatus: "ENROLLED" | "PENDING";
}

interface EmployeeRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  rfid_uid: string | null;
  face_id_status: "ENROLLED" | "PENDING";
}

const databaseDirectory = path.join(currentDir, "..", ".sentinel-data");
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
  try {
    mkdirSync(databaseDirectory, { recursive: true });
    const temporaryPath = `${usersDatabasePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, usersDatabasePath);
  } catch (error) {
    console.warn(`[STORAGE] Local file persist skipped on read-only serverless: ${error}`);
  }
}

function employeeToRow(user: RegisteredUser): EmployeeRow {
  return {
    id: user.id,
    full_name: user.fullName,
    email: user.email || "",
    role: user.role,
    rfid_uid: user.rfidUid === "NOT LINKED" ? null : normalizeRfidUid(user.rfidUid),
    face_id_status: user.faceIdStatus,
  };
}

function rowToEmployee(row: EmployeeRow): RegisteredUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    rfidUid: row.rfid_uid || "NOT LINKED",
    faceIdStatus: row.face_id_status,
  };
}

async function syncEmployeesToSupabase(users: RegisteredUser[]) {
  if (!supabase) return false;

  const { data: existingRows, error: selectError } = await supabase
    .from("employees")
    .select("id");
  if (selectError) throw selectError;

  if (users.length > 0) {
    const { error: upsertError } = await supabase
      .from("employees")
      .upsert(users.map(employeeToRow), { onConflict: "id" });
    if (upsertError) throw upsertError;
  }

  const currentIds = new Set(users.map((user) => user.id));
  const staleIds = (existingRows || [])
    .map((row) => String(row.id))
    .filter((id) => !currentIds.has(id));
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("employees")
      .delete()
      .in("id", staleIds);
    if (deleteError) throw deleteError;
  }

  supabaseHealthy = true;
  return true;
}

let registeredUsers = loadRegisteredUsers();
let enrollmentExpiresAt = 0;
let activeFaceEnrollment: { employeeId: string; expiresAt: number } | null = null;
let rfidRegistryVersion = Math.floor(Date.now() / 1000) >>> 0;

async function initializeSupabase() {
  if (!supabase) {
    console.log("[SUPABASE] Disabled; SUPABASE_URL/secret key are not configured");
    return;
  }

  try {
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) throw bucketsError;
    if (!buckets.some((bucket) => bucket.id === snapshotBucketName)) {
      const { error: createBucketError } = await supabase.storage.createBucket(
        snapshotBucketName,
        {
          public: false,
          fileSizeLimit: 5 * 1024 * 1024,
          allowedMimeTypes: ["image/jpeg"],
        },
      );
      if (createBucketError) throw createBucketError;
      console.log(`[SUPABASE] Created private ${snapshotBucketName} bucket`);
    }

    const { data, error } = await supabase
      .from("employees")
      .select("id,full_name,email,role,rfid_uid,face_id_status")
      .order("created_at", { ascending: false });
    if (error) throw error;

    if ((data || []).length === 0 && registeredUsers.length > 0) {
      await syncEmployeesToSupabase(registeredUsers);
      console.log(`[SUPABASE] Migrated ${registeredUsers.length} local employees`);
    } else {
      registeredUsers = (data || []).map((row) => rowToEmployee(row as EmployeeRow));
      persistRegisteredUsers(registeredUsers);
      supabaseHealthy = true;
      console.log(`[SUPABASE] Loaded ${registeredUsers.length} employees`);
    }

    if (mqttClient.connected && registeredUsers.length > 0) publishRfidRegistry();
  } catch (error) {
    supabaseHealthy = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SUPABASE] Initialization failed; using local cache: ${message}`);
  }
}

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

  if (eventType === "AUTH_FAILURE" || eventType === "AUTH_RETRY" || result === "denied") {
    return 0;
  }

  if (eventType === "AUTHENTICATION_ALERT") {
    const recipients = securityNotificationRecipients();
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

  if (eventType === "GATE_CLIMB_VIOLATION") {
    const recipients = securityNotificationRecipients();
    return sendNotification(
      recipients,
      "[Sentinel] CẢNH BÁO VI PHẠM TRÈO QUA CỔNG",
      [
        "HC-SR04 phát hiện vật thể trong vùng giám sát khi cổng chưa mở.",
        `Thời gian: ${eventTime}`,
        `Cổng: ${gateId}`,
        `Khoảng cách: ${String(payload.distance_cm ?? "không xác định")} cm`,
        "Trạng thái cổng: Đang đóng.",
        "Cảnh báo chỉ được gửi lại sau khi vùng cảm biến trống.",
      ].join("\n"),
    );
  }

  return 0;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function persistBoardEvent(
  payload: Record<string, unknown>,
  receivedAt: string,
) {
  if (!supabase) return;

  const eventName = optionalString(payload.event) || "unknown";
  const persistedEvents = new Set([
    "gate_event",
    "authentication_alert",
    "forced_lock_alert",
    "gate_violation",
  ]);
  if (!persistedEvents.has(eventName)) return;

  const employeeId = optionalString(payload.employee_id);
  const linkedEmployeeId = employeeId && registeredUsers.some((user) => user.id === employeeId)
    ? employeeId
    : null;
  const rawRfidUid = optionalString(payload.rfid_uid);
  const requestedSourceDevice = optionalString(payload.source_device_id);
  const sourceDevice = requestedSourceDevice &&
    ["gate-main", "camera-stream", "camera-hfr"].includes(requestedSourceDevice)
    ? requestedSourceDevice
    : "gate-main";
  const occurredAt = optionalString(payload.timestamp) || receivedAt;
  const eventType = optionalString(payload.eventType) ||
    optionalString(payload.event_type) || eventName.toUpperCase();
  const authMethod = optionalString(payload.authMethod) ||
    optionalString(payload.auth_method) || optionalString(payload.access_method);

  const { data: accessEvent, error: accessError } = await supabase
    .from("access_events")
    .insert({
      occurred_at: occurredAt,
      event_type: eventType,
      result: optionalString(payload.result),
      auth_method: authMethod?.toUpperCase() || null,
      employee_id: linkedEmployeeId,
      employee_name: optionalString(payload.employee_name),
      rfid_uid: rawRfidUid ? normalizeRfidUid(rawRfidUid) : null,
      confidence: optionalNumber(payload.confidence),
      reason: optionalString(payload.reason),
      gate_id: optionalString(payload.gate_id) || "GT-NORTH-01",
      source_device_id: sourceDevice,
      payload,
    })
    .select("id")
    .single();
  if (accessError) throw accessError;

  const isAlert = eventName === "authentication_alert" ||
    eventName === "forced_lock_alert" || eventName === "gate_violation" ||
    eventType.includes("ALERT") || eventType.includes("VIOLATION");
  if (isAlert) {
    const { error: alertError } = await supabase
      .from("security_alerts")
      .insert({
        access_event_id: accessEvent.id,
        occurred_at: occurredAt,
        alert_type: optionalString(payload.alertType) || eventType,
        gate_id: optionalString(payload.gate_id) || "GT-NORTH-01",
        distance_cm: optionalNumber(payload.distance_cm),
        auth_method: authMethod?.toUpperCase() || null,
        failed_attempts: optionalNumber(payload.failedAttempts) || 0,
        payload,
      });
    if (alertError) throw alertError;
  }

  const { error: deviceError } = await supabase
    .from("devices")
    .update({ status: "ONLINE", last_seen_at: receivedAt })
    .eq("id", sourceDevice);
  if (deviceError) throw deviceError;
  supabaseHealthy = true;
}

const mqttClient = mqttUrl
  ? mqtt.connect(mqttUrl, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `sentinel-web-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
  })
  : ({
    connected: false,
    publish: (_t: string, _m: string, _o?: unknown, cb?: (err?: Error) => void) => cb?.(),
    subscribe: (_t: string, _o?: unknown, cb?: (err?: Error) => void) => cb?.(),
    on: () => {},
  } as unknown as mqtt.MqttClient);

void initializeSupabase();

if (mqttUrl && mqttClient.on) {
  mqttClient.on("connect", () => {
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
}

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

    void persistBoardEvent(payload, receivedAt).catch((error: Error) => {
      supabaseHealthy = false;
      console.error(`[SUPABASE] Event persistence failed: ${error.message}`);
    });

    if (payload.event === "gate_event" || payload.event === "authentication_alert" || payload.event === "forced_lock_alert" || payload.event === "gate_violation") {
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
        void syncEmployeesToSupabase(registeredUsers).catch((error: Error) => {
          supabaseHealthy = false;
          console.error(`[SUPABASE] Face status sync failed: ${error.message}`);
        });
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
    supabaseConfigured: Boolean(supabase),
    supabaseHealthy,
  });
});

app.get("/api/users", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ users: registeredUsers });
});

app.get("/api/camera/status", async (_request, response) => {
  try {
    const statusUrl = new URL(cameraStreamUrl);
    if (!statusUrl.hostname.includes("ngrok")) {
      statusUrl.port = "80";
    }
    statusUrl.pathname = "/status";
    statusUrl.search = "";
    const upstreamResponse = await fetch(statusUrl.toString(), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstreamResponse.ok) {
      response.status(502).json({ online: false, error: `Camera returned HTTP ${upstreamResponse.status}` });
      return;
    }
    response.status(200).json(await upstreamResponse.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Camera status unavailable";
    console.warn(`[CAMERA] Status error: ${message}`);
    response.status(502).json({ online: false, error: "Camera status unavailable" });
  }
});

app.get("/api/camera/capture", async (_request, response) => {
  try {
    const captureUrl = new URL(cameraStreamUrl);
    captureUrl.pathname = "/capture";
    captureUrl.search = "";
    const upstreamResponse = await fetch(captureUrl.toString(), {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstreamResponse.ok) {
      response.status(502).json({ error: `Camera returned HTTP ${upstreamResponse.status}` });
      return;
    }
    const jpeg = Buffer.from(await upstreamResponse.arrayBuffer());
    response.status(200);
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.send(jpeg);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Camera capture unavailable";
    console.warn(`[CAMERA] Capture error: ${message}`);
    response.status(502).json({ error: "Camera capture unavailable" });
  }
});

app.get("/api/camera/stream", async (request, response) => {
  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(cameraStreamUrl);
  } catch {
    response.status(500).json({ error: "Camera stream URL is invalid" });
    return;
  }

  // If using Ngrok or standard HTTP capture
  try {
    const captureUrl = new URL(cameraStreamUrl);
    captureUrl.pathname = "/capture";
    captureUrl.search = "";
    const upstreamResponse = await fetch(captureUrl.toString(), {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(5_000),
    });
    if (upstreamResponse.ok) {
      const jpeg = Buffer.from(await upstreamResponse.arrayBuffer());
      response.status(200);
      response.setHeader("Content-Type", "image/jpeg");
      response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      response.send(jpeg);
      return;
    }
  } catch {
    // fallback
  }

  const openStream = upstreamUrl.protocol === "https:" ? httpsGet : httpGet;
  const upstreamRequest = openStream(upstreamUrl, (upstreamResponse) => {
    if (upstreamResponse.statusCode !== 200) {
      upstreamResponse.resume();
      response.status(502).json({ error: `Camera returned HTTP ${upstreamResponse.statusCode || 0}` });
      return;
    }

    response.status(200);
    response.setHeader(
      "Content-Type",
      upstreamResponse.headers["content-type"] || "multipart/x-mixed-replace",
    );
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.setHeader("Connection", "keep-alive");
    upstreamResponse.pipe(response);
    response.on("close", () => upstreamResponse.destroy());
  });

  upstreamRequest.setTimeout(8_000, () => {
    upstreamRequest.destroy(new Error("Camera stream timeout"));
  });
  upstreamRequest.on("error", (error) => {
    if (response.destroyed) return;
    console.warn(`[CAMERA] Stream proxy error: ${error.message}`);
    if (!response.headersSent) {
      response.status(502).json({ error: "Camera stream unavailable" });
    } else {
      response.end();
    }
  });
});

app.put("/api/users", async (request, response) => {
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

  try {
    await syncEmployeesToSupabase(normalizedUsers);
  } catch (error) {
    supabaseHealthy = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SUPABASE] Employee sync failed: ${message}`);
    response.status(502).json({
      error: "Supabase sync failed; employee data was not changed",
      savedLocal: false,
    });
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

app.post("/api/gate/override", async (request, response) => {
  const action = typeof request.body?.action === "string" ? request.body.action.trim().toLowerCase() : "";
  if (!["open", "close", "normal", "buzzer_on", "buzzer_off"].includes(action)) {
    response.status(400).json({ error: "Hành động điều khiển không hợp lệ" });
    return;
  }

  if (mqttClient.connected) {
    mqttClient.publish(
      mqttCommandTopic,
      JSON.stringify({ action }),
      { qos: 1, retain: false },
      (error) => {
        if (error) {
          console.error(`[GATE] Lỗi gửi lệnh override: ${error.message}`);
          response.status(500).json({ error: "Không thể gửi lệnh tới thiết bị" });
        } else {
          console.log(`[GATE] Lệnh override đã gửi: ${action}`);
          response.status(200).json({ success: true, action });
        }
      }
    );
    return;
  }

  // Fallback for Serverless: Create on-demand temporary MQTT connection
  if (!mqttUrl || !process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
    response.status(503).json({ error: "MQTT broker chưa được cấu hình" });
    return;
  }

  try {
    const tempClient = mqtt.connect(mqttUrl, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clientId: `sentinel-cmd-${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      connectTimeout: 8000,
    });

    tempClient.on("connect", () => {
      tempClient.publish(
        mqttCommandTopic,
        JSON.stringify({ action }),
        { qos: 1, retain: false },
        (error) => {
          tempClient.end(true);
          if (error) {
            response.status(500).json({ error: "Lỗi gửi lệnh tới thiết bị" });
          } else {
            response.status(200).json({ success: true, action });
          }
        }
      );
    });

    tempClient.on("error", (err) => {
      tempClient.end(true);
      response.status(502).json({ error: `Kết nối MQTT thất bại: ${err.message}` });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    response.status(500).json({ error: message });
  }
});

app.post("/api/face-enrollment/start", (request, response) => {
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

  const payload = JSON.stringify({ action: "face_enrollment_start", employee_id: employeeId });

  if (mqttClient.connected) {
    mqttClient.publish(mqttCommandTopic, payload, { qos: 1, retain: false }, (error) => {
      if (error) {
        activeFaceEnrollment = null;
        console.error(`[FACE] Enrollment command failed: ${error.message}`);
        response.status(500).json({ error: "Không thể gửi lệnh tới camera" });
      } else {
        console.log(`[FACE] Enrollment requested for ${employeeId}`);
        response.status(202).json({ accepted: true, employeeId });
      }
    });
    return;
  }

  // On-demand MQTT for Serverless Vercel
  if (!mqttUrl || !process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
    activeFaceEnrollment = null;
    response.status(503).json({ error: "MQTT broker chưa được cấu hình" });
    return;
  }

  try {
    const tempClient = mqtt.connect(mqttUrl, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clientId: `sentinel-face-${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      connectTimeout: 8000,
    });

    tempClient.on("connect", () => {
      tempClient.publish(mqttCommandTopic, payload, { qos: 1, retain: false }, (error) => {
        tempClient.end(true);
        if (error) {
          activeFaceEnrollment = null;
          response.status(500).json({ error: "Lỗi gửi lệnh tới thiết bị" });
        } else {
          console.log(`[FACE] Enrollment requested for ${employeeId}`);
          response.status(202).json({ accepted: true, employeeId });
        }
      });
    });

    tempClient.on("error", (err) => {
      tempClient.end(true);
      activeFaceEnrollment = null;
      response.status(502).json({ error: `Kết nối MQTT thất bại: ${err.message}` });
    });
  } catch (err) {
    activeFaceEnrollment = null;
    const message = err instanceof Error ? err.message : String(err);
    response.status(500).json({ error: message });
  }
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

export default app;


