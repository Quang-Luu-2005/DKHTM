import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { config } from "../config.js";
import { serializeAuditLog } from "../domain.js";
import { publish } from "../events/sse.js";
import { prisma } from "../prisma.js";

function classifyEvent(event) {
  const text = `${event.eventType} ${event.message}`.toUpperCase();
  const violation = /(ERROR|FAILED|MISMATCH|DENIED|JUMP|CLIMB|TAILGAT|VIOLATION)/.test(text);
  let accessMethod = "MANUAL_OVERRIDE";
  if (text.includes("TAILGAT")) accessMethod = "TAILGATING";
  else if (/(JUMP|CLIMB)/.test(text)) accessMethod = "GATE_JUMPING";
  else if (text.includes("RFID")) accessMethod = "RFID";
  else if (text.includes("FACE")) accessMethod = "FACE_ID";
  return { status: violation ? "VIOLATION" : "ONLINE", accessMethod };
}

export async function ingestDeviceEvent(input) {
  const gateId = input.gateId || input.doorId || config.DEFAULT_GATE_ID;
  const eventId = input.eventId || `legacy_${randomUUID()}`;
  const existing = await prisma.deviceEvent.findUnique({ where: { deviceId_eventId: { deviceId: input.deviceId, eventId } } });
  if (existing) return { duplicate: true, event: existing, log: null };

  const classification = classifyEvent(input);
  let result;
  try {
    result = await prisma.$transaction(async tx => {
      const device = await tx.device.upsert({
        where: { id: input.deviceId },
        create: { id: input.deviceId, type: input.source.includes("CONTROLLER") ? "CONTROLLER" : "CAMERA", name: input.deviceId, gateId, online: true, lastSeenAt: new Date() },
        update: { gateId, online: true, lastSeenAt: new Date(), lastError: classification.status === "VIOLATION" ? input.message : null }
      });
      const event = await tx.deviceEvent.create({
        data: { deviceId: input.deviceId, eventId, eventType: input.eventType, message: input.message, confidence: input.confidence, occurredAt: input.occurredAt ? new Date(input.occurredAt) : null, payload: input }
      });
      const log = await tx.auditLog.create({
        data: {
          subjectName: input.message || input.eventType,
          accessMethod: classification.accessMethod,
          gateId,
          status: classification.status,
          confidence: input.confidence === undefined ? "N/A" : `${Math.round(input.confidence * 100)}%`,
          source: input.source,
          deviceId: input.deviceId,
          metadata: { eventId, eventType: input.eventType }
        }
      });
      return { device, event, log };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { duplicate: true, event: null, log: null };
    }
    throw error;
  }

  publish("device.event", { ...input, eventId, gateId, receivedAt: result.event.receivedAt.toISOString() });
  if (/ONLINE/.test(input.eventType)) publish("device.online", result.device);
  const log = serializeAuditLog(result.log);
  publish("audit.log", log);
  return { duplicate: false, event: result.event, log };
}

export async function getDevice(id) {
  return prisma.device.findUnique({ where: { id } });
}

export function startDeviceOfflineMonitor() {
  const intervalMs = Math.max(5000, Math.floor(config.DEVICE_OFFLINE_AFTER_MS / 2));
  const timer = setInterval(async () => {
    const cutoff = new Date(Date.now() - config.DEVICE_OFFLINE_AFTER_MS);
    try {
      const offline = await prisma.device.findMany({ where: { online: true, lastSeenAt: { lt: cutoff } } });
      for (const device of offline) {
        await prisma.device.update({ where: { id: device.id }, data: { online: false } });
        publish("device.offline", { ...device, online: false });
      }
    } catch (error) {
      console.error("Device offline monitor failed", error);
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
