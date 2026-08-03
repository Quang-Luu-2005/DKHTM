import { z } from "zod";

export const userSchema = z.object({
  id: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(160),
  role: z.enum(["Administrator", "Security Officer", "Technician", "General Staff"]),
  rfidUid: z.string().trim().max(64),
  faceIdStatus: z.enum(["ENROLLED", "PENDING"]),
  // Enrolled portraits are served from a same-origin relative API path.
  avatarUrl: z.string().trim().max(2048).optional()
}).strict();

export const faceEnrollmentSchema = z.object({
  id: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(160),
  role: z.enum(["Administrator", "Security Officer", "Technician", "General Staff"]),
  rfidUid: z.string().trim().max(64).optional().default("")
}).strict();

export const auditLogSchema = z.object({
  id: z.string().min(1).optional(),
  timestamp: z.string().optional(),
  subjectName: z.string().trim().min(1).max(200),
  subjectId: z.string().max(64).optional(),
  accessMethod: z.enum(["Face ID", "RFID", "Manual Override", "Gate Jumping / Climbing detected", "Tailgating detected"]),
  gateId: z.string().trim().min(1).max(64),
  status: z.enum(["ONLINE", "VIOLATION", "EXPIRED"]),
  confidence: z.string().trim().min(1).max(32),
  avatarUrl: z.string().url().optional(),
  source: z.string().max(64).optional(),
  deviceId: z.string().max(64).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();

export const hardwareStateSchema = z.object({
  servoArm: z.enum(["SECURED / CLOSED", "OPENED / UNSECURED"]),
  servoLocked: z.boolean(),
  indicatorLed: z.enum(["RED / RESTRICTED", "GREEN / ACCESS ALLOWED"]),
  systemBuzzer: z.enum(["MUTED", "ACTIVE"])
}).strict();

export const commandSchema = z.object({
  command: z.enum(["lock", "grant", "deny", "idle", "LOCK", "GRANT", "DENY", "IDLE"])
}).strict();

export const deviceEventSchema = z.object({
  eventId: z.string().trim().min(1).max(128).optional(),
  deviceId: z.string().trim().min(1).max(64),
  gateId: z.string().trim().min(1).max(64).optional(),
  doorId: z.string().trim().min(1).max(64).optional(),
  source: z.string().trim().min(1).max(64).default("ESP32_CAM"),
  eventType: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  dimension: z.number().int().min(1).max(2048).optional(),
  vector: z.array(z.number().finite()).min(1).max(2048).optional(),
  occurredAt: z.string().datetime().optional()
}).passthrough().superRefine((event, context) => {
  if (event.eventType.toUpperCase() !== "FACE_EMBEDDING") return;
  if (!event.model) {
    context.addIssue({ code: "custom", path: ["model"], message: "FACE_EMBEDDING requires model" });
  }
  if (!event.vector) {
    context.addIssue({ code: "custom", path: ["vector"], message: "FACE_EMBEDDING requires vector" });
  }
  if (event.dimension === undefined) {
    context.addIssue({ code: "custom", path: ["dimension"], message: "FACE_EMBEDDING requires dimension" });
  } else if (event.vector && event.dimension !== event.vector.length) {
    context.addIssue({ code: "custom", path: ["dimension"], message: "dimension must equal vector length" });
  } else if (event.vector?.every(component => Math.abs(component) <= Number.EPSILON)) {
    context.addIssue({ code: "custom", path: ["vector"], message: "FACE_EMBEDDING vector must have non-zero magnitude" });
  }
});

export const snapshotQuerySchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  gateId: z.string().trim().min(1).max(64).optional(),
  doorId: z.string().trim().min(1).max(64).optional(),
  eventId: z.string().trim().min(1).max(128).optional()
});
