import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { publish } from "../events/sse.js";
import { prisma } from "../prisma.js";

export async function saveSnapshot(payload, query) {
  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  const gateId = query.gateId || query.doorId || config.DEFAULT_GATE_ID;
  const filename = `${Date.now()}-${randomUUID()}.jpg`;
  const filePath = path.join(config.UPLOAD_DIR, filename);
  await fs.writeFile(filePath, payload);
  try {
    const snapshot = await prisma.$transaction(async tx => {
      await tx.device.upsert({
        where: { id: query.deviceId },
        create: { id: query.deviceId, type: "CAMERA", name: query.deviceId, gateId, online: true, lastSeenAt: new Date() },
        update: { gateId, online: true, lastSeenAt: new Date() }
      });
      return tx.snapshot.create({
        data: { deviceId: query.deviceId, gateId, filePath, mimeType: "image/jpeg", size: payload.length, eventId: query.eventId }
      });
    });
    const result = { id: snapshot.id, deviceId: snapshot.deviceId, gateId, size: snapshot.size, capturedAt: snapshot.capturedAt.toISOString(), url: `/api/device/camera/snapshot/${snapshot.id}` };
    publish("snapshot.created", result);
    return result;
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    throw error;
  }
}

export function latestSnapshot() {
  return prisma.snapshot.findFirst({ orderBy: { capturedAt: "desc" } });
}

export function findSnapshot(id) {
  return prisma.snapshot.findUnique({ where: { id } });
}
