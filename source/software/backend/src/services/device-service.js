import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { config } from "../config.js";
import { serializeAuditLog } from "../domain.js";
import { publish } from "../events/sse.js";
import { prisma } from "../prisma.js";
import { applyAccessDecision } from "./access-service.js";
import { classifyDeviceEvent, finalizeRfidDecision, normalizeRfidUid } from "./access-policy.js";

async function resolveClassification(input) {
  let classification = classifyDeviceEvent(input);
  if (classification.decision !== "VERIFY_RFID") return classification;

  const rfidUid = normalizeRfidUid(input.rfidUid);
  const candidates = await prisma.user.findMany({
    where: { rfidUid: { not: null } },
    select: { id: true, fullName: true, rfidUid: true }
  });
  const user = candidates.find(candidate => normalizeRfidUid(candidate.rfidUid) === rfidUid);
  return finalizeRfidDecision(classification, user, rfidUid);
}

export async function ingestDeviceEvent(input) {
  const gateId = input.gateId || input.doorId || config.DEFAULT_GATE_ID;
  const eventId = input.eventId || `legacy_${randomUUID()}`;
  const existing = await prisma.deviceEvent.findUnique({ where: { deviceId_eventId: { deviceId: input.deviceId, eventId } } });
  if (existing) return { duplicate: true, event: existing, log: null };

  const classification = await resolveClassification(input);
  const metadata = {
    eventId,
    eventType: input.eventType,
    accessDecision: classification.decision
  };
  if (input.recognizedId !== undefined) metadata.recognizedId = input.recognizedId;
  if (input.rfidUid !== undefined) metadata.rfidUid = input.rfidUid;
  let result;
  try {
    result = await prisma.$transaction(async tx => {
      const device = await tx.device.upsert({
        where: { id: input.deviceId },
        create: { id: input.deviceId, type: input.source.includes("CONTROLLER") ? "CONTROLLER" : "CAMERA", name: input.deviceId, gateId, online: true, lastSeenAt: new Date() },
        update: { gateId, online: true, lastSeenAt: new Date(), lastError: classification.status === "VIOLATION" ? input.message : null }
      });
      const event = await tx.deviceEvent.create({
        data: {
          deviceId: input.deviceId,
          eventId,
          eventType: input.eventType,
          message: input.message,
          confidence: input.confidence,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
          payload: { ...input, accessDecision: classification.decision }
        }
      });
      const log = classification.shouldAudit ? await tx.auditLog.create({
        data: {
          subjectName: classification.subjectName,
          subjectId: classification.subjectId,
          accessMethod: classification.accessMethod,
          gateId,
          status: classification.status,
          confidence: classification.confidence,
          source: input.source,
          deviceId: input.deviceId,
          metadata
        }
      }) : null;
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
  const log = result.log ? serializeAuditLog(result.log) : null;
  if (log) publish("audit.log", log);

  let hardware = null;
  try {
    hardware = await applyAccessDecision({
      decision: classification.decision,
      gateId,
      subjectName: classification.subjectName
    });
  } catch (error) {
    console.error("Failed to queue automatic access decision", error);
  }

  return {
    duplicate: false,
    event: result.event,
    log,
    accessDecision: classification.decision,
    hardware
  };
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
