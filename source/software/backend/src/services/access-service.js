import { config } from "../config.js";
import { getHardwareState, queueHardwareUpdate, stateForLegacyCommand } from "./hardware-service.js";

const resetTimers = new Map();
const grantLeases = new Map();

export function hasActiveGrantLease(gateId, now = Date.now()) {
  const expiresAt = grantLeases.get(gateId);
  if (typeof expiresAt !== "number" || expiresAt <= now) {
    grantLeases.delete(gateId);
    return false;
  }
  return true;
}

export function clearGrantLeases() {
  grantLeases.clear();
}

export function registerGrantLease(gateId, durationMs, now = Date.now()) {
  const expiresAt = now + durationMs;
  grantLeases.set(gateId, expiresAt);
  return expiresAt;
}

export function scheduleGateReset(gateId, delayMs, subjectName) {
  const currentTimer = resetTimers.get(gateId);
  if (currentTimer) clearTimeout(currentTimer);

  const timer = setTimeout(async () => {
    resetTimers.delete(gateId);
    grantLeases.delete(gateId);
    try {
      const current = await getHardwareState(gateId);
      const desired = stateForLegacyCommand("LOCK", current.desiredState);
      await queueHardwareUpdate(desired, {
        gateId,
        subjectName,
        source: "ACCESS_POLICY",
        skipAudit: true
      });
    } catch (error) {
      console.error("Automatic gate reset failed", error);
    }
  }, delayMs);
  timer.unref();
  resetTimers.set(gateId, timer);
}

export async function applyAccessDecision({ decision, gateId, subjectName }) {
  if (decision !== "GRANT" && decision !== "DENY") return null;
  if (decision === "DENY" && hasActiveGrantLease(gateId)) {
    return null;
  }

  const resetDelay = decision === "GRANT"
    ? config.ACCESS_UNLOCK_DURATION_MS
    : config.DENIED_SIGNAL_DURATION_MS;
  let leaseExpiresAt = null;
  if (decision === "GRANT") {
    leaseExpiresAt = registerGrantLease(gateId, resetDelay);
  }

  let hardware;
  try {
    const current = await getHardwareState(gateId);
    const desired = stateForLegacyCommand(decision, current.desiredState);
    hardware = await queueHardwareUpdate(desired, {
      gateId,
      subjectName: `${decision === "GRANT" ? "Cho phép" : "Từ chối"}: ${subjectName}`,
      source: "ACCESS_POLICY",
      skipAudit: true
    });
  } catch (error) {
    if (leaseExpiresAt !== null && grantLeases.get(gateId) === leaseExpiresAt) {
      grantLeases.delete(gateId);
    }
    throw error;
  }

  scheduleGateReset(
    gateId,
    resetDelay,
    decision === "GRANT" ? "Tự động đóng cửa sau xác thực" : "Kết thúc cảnh báo truy cập"
  );
  return hardware;
}
