import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { config } from "../config.js";
import { serializeAuditLog } from "../domain.js";
import { publish } from "../events/sse.js";
import { prisma } from "../prisma.js";
import { hardwareStateSchema } from "../schemas.js";
import { applyAccessDecision } from "./access-service.js";
import { classifyDeviceEvent, finalizeRfidDecision, normalizeRfidUid } from "./access-policy.js";
import { finalizeFaceDecision, openPresenceWindow, resolveFaceEmbedding } from "./face-service.js";
import { markHardwareOffline, reportHardwareTelemetry } from "./hardware-service.js";

function controllerHardwareState(input) {
  if (!String(input.source || "").toUpperCase().includes("CONTROLLER") || !input.hardware) {
    return null;
  }
  const candidate = {
    servoArm: input.hardware.servoArm,
    servoLocked: input.hardware.servoLocked,
    indicatorLed: input.hardware.indicatorLed,
    systemBuzzer: input.hardware.systemBuzzer
  };
  const parsed = hardwareStateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

async function resolveClassification(input, gateId) {
  const eventType = input.eventType.toUpperCase();
  if (eventType === "PRESENCE_DETECTED") openPresenceWindow(gateId);

  let classification = classifyDeviceEvent(input);
  if (classification.decision === "VERIFY_FACE") {
    const match = await resolveFaceEmbedding({
      gateId,
      vector: input.vector,
      model: input.model
    });
    return finalizeFaceDecision(classification, match);
  }
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

  const classification = await resolveClassification(input, gateId);
  if (input.eventType.toUpperCase() === "FACE_EMBEDDING"
      && classification.decision === null
      && classification.faceMatch?.reason === "OUTSIDE_PRESENCE_WINDOW") {
    await prisma.device.upsert({
      where: { id: input.deviceId },
      create: {
        id: input.deviceId,
        type: "CAMERA",
        name: input.deviceId,
        gateId,
        online: true,
        lastSeenAt: new Date()
      },
      update: { gateId, online: true, lastSeenAt: new Date(), lastError: null }
    });
    return {
      duplicate: false,
      ignored: true,
      event: null,
      log: null,
      accessDecision: null,
      hardware: null
    };
  }
  const metadata = {
    eventId,
    eventType: input.eventType,
    accessDecision: classification.decision
  };
  if (input.recognizedId !== undefined) metadata.recognizedId = input.recognizedId;
  if (input.rfidUid !== undefined) metadata.rfidUid = input.rfidUid;
  if (classification.faceMatch) Object.assign(metadata, classification.faceMatch);
  const { vector: _vector, embedding: _embedding, ...safePayload } = input;
  safePayload.accessDecision = classification.decision;
  if (classification.faceMatch) safePayload.faceMatch = classification.faceMatch;
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
          confidence: classification.faceMatch?.similarity ?? input.confidence,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
          payload: safePayload
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

  publish("device.event", { ...safePayload, eventId, gateId, receivedAt: result.event.receivedAt.toISOString() });
  if (/ONLINE/.test(input.eventType)) publish("device.online", result.device);
  const log = result.log ? serializeAuditLog(result.log) : null;
  if (log) publish("audit.log", log);

  const reportedState = controllerHardwareState(input);
  if (reportedState) {
    await reportHardwareTelemetry(gateId, reportedState);
  }

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
    ignored: false,
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
        if (device.type === "CONTROLLER") {
          await markHardwareOffline(device.gateId);
        }
      }
    } catch (error) {
      console.error("Device offline monitor failed", error);
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
