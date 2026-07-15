import { z } from "zod";

export const userSchema = z.object({
  id: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(160),
  role: z.enum(["Administrator", "Security Officer", "Technician", "General Staff"]),
  rfidUid: z.string().trim().max(64),
  faceIdStatus: z.enum(["ENROLLED", "PENDING"]),
  avatarUrl: z.string().url().optional()
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
  occurredAt: z.string().datetime().optional()
}).passthrough();

export const snapshotQuerySchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  gateId: z.string().trim().min(1).max(64).optional(),
  doorId: z.string().trim().min(1).max(64).optional(),
  eventId: z.string().trim().min(1).max(128).optional()
});
