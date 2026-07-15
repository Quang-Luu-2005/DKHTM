import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { hardwareResponse, initialHardwareState, serializeAuditLog } from "../domain.js";
import { publish } from "../events/sse.js";
import { prisma } from "../prisma.js";

const dispatchQueues = new Map();

function commandView(command) {
  return {
    commandId: command.commandId,
    gateId: command.gateId,
    command: command.command,
    status: command.status,
    retryCount: command.retryCount,
    lastError: command.lastError,
    createdAt: command.createdAt.toISOString(),
    acknowledgedAt: command.acknowledgedAt?.toISOString() || null
  };
}

async function ensureHardwareState(gateId) {
  return prisma.gateHardwareState.upsert({
    where: { gateId },
    create: { gateId, desiredState: initialHardwareState, reportedState: initialHardwareState },
    update: {}
  });
}

export async function getHardwareState(gateId = config.DEFAULT_GATE_ID) {
  const record = await ensureHardwareState(gateId);
  const command = record.lastCommandId
    ? await prisma.hardwareCommand.findUnique({ where: { commandId: record.lastCommandId } })
    : null;
  return hardwareResponse(record, command);
}

export async function queueHardwareUpdate(desiredState, options = {}) {
  const gateId = options.gateId || config.DEFAULT_GATE_ID;
  const commandId = `cmd_${randomUUID()}`;
  const result = await prisma.$transaction(async tx => {
    const controller = await tx.device.upsert({
      where: { id: config.CONTROLLER_DEVICE_ID },
      create: { id: config.CONTROLLER_DEVICE_ID, type: "CONTROLLER", name: "Main controller", gateId, ipAddress: config.CONTROLLER_URL, online: false },
      update: { gateId, ipAddress: config.CONTROLLER_URL }
    });
    const command = await tx.hardwareCommand.create({
      data: { commandId, gateId, targetDeviceId: controller.id, command: "SET_STATE", requestedState: desiredState }
    });
    const hardware = await tx.gateHardwareState.upsert({
      where: { gateId },
      create: { gateId, desiredState, reportedState: initialHardwareState, lastCommandId: commandId },
      update: { desiredState, lastCommandId: commandId }
    });
    const log = await tx.auditLog.create({
      data: {
        subjectName: options.subjectName || "Hardware state command",
        accessMethod: "MANUAL_OVERRIDE",
        gateId,
        status: "ONLINE",
        confidence: "100%",
        source: "DASHBOARD",
        deviceId: controller.id,
        metadata: { commandId, desiredState }
      }
    });
    return { command, hardware, log };
  });

  publish("hardware.command", commandView(result.command));
  publish("hardware.state", hardwareResponse(result.hardware, result.command));
  publish("audit.log", serializeAuditLog(result.log));
  setImmediate(() => scheduleHardwareCommand(result.command.id, result.command.gateId));
  return hardwareResponse(result.hardware, result.command);
}

function scheduleHardwareCommand(databaseId, gateId) {
  const previous = dispatchQueues.get(gateId) || Promise.resolve();
  let next;
  next = previous
    .catch(() => undefined)
    .then(() => dispatchHardwareCommand(databaseId))
    .catch(error => console.error("Command dispatch failed", error))
    .finally(() => {
      if (dispatchQueues.get(gateId) === next) dispatchQueues.delete(gateId);
    });
  dispatchQueues.set(gateId, next);
  return next;
}

async function postToController(command) {
  if (!config.CONTROLLER_URL) throw new Error("Controller URL is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.COMMAND_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.CONTROLLER_URL}/api/hardware/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commandId: command.commandId, gateId: command.gateId, command: command.command, desiredState: command.requestedState }),
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error(`Controller returned invalid JSON (${response.status})`); }
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || `Controller returned HTTP ${response.status}`);
    if (payload.commandId !== command.commandId) throw new Error("Controller acknowledgement commandId mismatch");
    if (!payload.hardware) throw new Error("Controller acknowledgement has no hardware state");
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatchHardwareCommand(databaseId) {
  let lastError = null;
  let timedOut = false;
  for (let attempt = 1; attempt <= config.COMMAND_MAX_ATTEMPTS; attempt++) {
    const command = await prisma.hardwareCommand.update({
      where: { id: databaseId },
      data: { status: "SENT", retryCount: attempt, sentAt: new Date(), lastError: null }
    });
    publish("hardware.command", commandView(command));
    try {
      const acknowledgement = await postToController(command);
      const result = await prisma.$transaction(async tx => {
        const acked = await tx.hardwareCommand.update({
          where: { id: databaseId },
          data: { status: "ACKED", ackPayload: acknowledgement, acknowledgedAt: new Date(), lastError: null }
        });
        const hardware = await tx.gateHardwareState.update({
          where: { gateId: command.gateId },
          data: { reportedState: acknowledgement.hardware, connectionStatus: "ONLINE", lastReportedAt: new Date() }
        });
        await tx.device.update({
          where: { id: config.CONTROLLER_DEVICE_ID },
          data: { online: true, lastSeenAt: new Date(), lastError: null }
        });
        return { acked, hardware };
      });
      publish("hardware.command", commandView(result.acked));
      publish("hardware.state", hardwareResponse(result.hardware, result.acked));
      publish("device.online", { deviceId: config.CONTROLLER_DEVICE_ID, gateId: command.gateId });
      return result.acked;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      timedOut ||= error?.name === "AbortError" || /fetch failed|not configured|timeout/i.test(lastError);
      if (attempt < config.COMMAND_MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  const finalStatus = timedOut ? "TIMEOUT" : "FAILED";
  const result = await prisma.$transaction(async tx => {
    const failed = await tx.hardwareCommand.update({ where: { id: databaseId }, data: { status: finalStatus, lastError } });
    const hardware = await tx.gateHardwareState.update({ where: { gateId: failed.gateId }, data: { connectionStatus: "OFFLINE" } });
    await tx.device.update({ where: { id: config.CONTROLLER_DEVICE_ID }, data: { online: false, lastError } });
    return { failed, hardware };
  });
  publish("hardware.command", commandView(result.failed));
  publish("hardware.state", hardwareResponse(result.hardware, result.failed));
  publish("device.offline", { deviceId: config.CONTROLLER_DEVICE_ID, gateId: result.failed.gateId, error: lastError });
  return result.failed;
}

export function stateForLegacyCommand(command, current) {
  const normalized = command.toUpperCase();
  if (normalized === "LOCK") return { ...current, servoArm: "SECURED / CLOSED", servoLocked: true, indicatorLed: "RED / RESTRICTED", systemBuzzer: "MUTED" };
  if (normalized === "GRANT") return { ...current, servoArm: "OPENED / UNSECURED", servoLocked: false, indicatorLed: "GREEN / ACCESS ALLOWED", systemBuzzer: "MUTED" };
  if (normalized === "DENY") return { ...current, servoArm: "SECURED / CLOSED", servoLocked: true, indicatorLed: "RED / RESTRICTED", systemBuzzer: "ACTIVE" };
  return { ...current, systemBuzzer: "MUTED" };
}
