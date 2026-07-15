import { prisma } from "../prisma.js";
import { accessMethodToDb, serializeAuditLog } from "../domain.js";
import { publish } from "../events/sse.js";

export function auditCreateData(input) {
  return {
    id: input.id,
    timestamp: input.timestamp ? new Date(input.timestamp.replace(" ", "T")) : undefined,
    subjectName: input.subjectName,
    subjectId: input.subjectId,
    accessMethod: accessMethodToDb[input.accessMethod] || input.accessMethod,
    gateId: input.gateId,
    status: input.status,
    confidence: input.confidence,
    avatarUrl: input.avatarUrl,
    source: input.source,
    deviceId: input.deviceId,
    metadata: input.metadata
  };
}

export async function listAuditLogs(limit = 500) {
  const logs = await prisma.auditLog.findMany({ orderBy: { timestamp: "desc" }, take: limit });
  return logs.map(serializeAuditLog);
}

export async function createAuditLog(input) {
  const log = await prisma.auditLog.create({ data: auditCreateData(input) });
  const serialized = serializeAuditLog(log);
  publish("audit.log", serialized);
  return serialized;
}
