import { config } from "../config.js";
import { getHardwareState, queueHardwareUpdate, stateForLegacyCommand } from "./hardware-service.js";

const resetTimers = new Map();

function scheduleReset(gateId, delayMs, subjectName) {
  const currentTimer = resetTimers.get(gateId);
  if (currentTimer) clearTimeout(currentTimer);

  const timer = setTimeout(async () => {
    resetTimers.delete(gateId);
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

  const current = await getHardwareState(gateId);
  const desired = stateForLegacyCommand(decision, current.desiredState);
  const hardware = await queueHardwareUpdate(desired, {
    gateId,
    subjectName: `${decision === "GRANT" ? "Cho phép" : "Từ chối"}: ${subjectName}`,
    source: "ACCESS_POLICY",
    skipAudit: true
  });

  scheduleReset(
    gateId,
    decision === "GRANT" ? config.ACCESS_UNLOCK_DURATION_MS : config.DENIED_SIGNAL_DURATION_MS,
    decision === "GRANT" ? "Tự động đóng cửa sau xác thực" : "Kết thúc cảnh báo truy cập"
  );
  return hardware;
}
