import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler, validate } from "../middleware/http.js";
import { commandSchema, hardwareStateSchema } from "../schemas.js";
import { registerGrantLease, scheduleGateReset } from "../services/access-service.js";
import { getHardwareState, queueHardwareUpdate, stateForLegacyCommand } from "../services/hardware-service.js";

export const hardwareRouter = Router();
hardwareRouter.get("/", asyncHandler(async (_req, res) => res.json(await getHardwareState())));
hardwareRouter.put("/", validate(hardwareStateSchema), asyncHandler(async (req, res) => {
  const hardware = await queueHardwareUpdate(req.validated.body);
  if (!req.validated.body.servoLocked) {
    registerGrantLease(config.DEFAULT_GATE_ID, config.ACCESS_UNLOCK_DURATION_MS);
    scheduleGateReset(
      config.DEFAULT_GATE_ID,
      config.ACCESS_UNLOCK_DURATION_MS,
      "Tự động đóng cửa sau lệnh mở dashboard"
    );
  }
  res.status(202).json(hardware);
}));
hardwareRouter.post("/command", validate(commandSchema), asyncHandler(async (req, res) => {
  const current = await getHardwareState(config.DEFAULT_GATE_ID);
  const desired = stateForLegacyCommand(req.validated.body.command, current.desiredState);
  const hardware = await queueHardwareUpdate(desired, { subjectName: `Hardware ${req.validated.body.command}` });
  if (req.validated.body.command.toUpperCase() === "GRANT") {
    registerGrantLease(config.DEFAULT_GATE_ID, config.ACCESS_UNLOCK_DURATION_MS);
    scheduleGateReset(
      config.DEFAULT_GATE_ID,
      config.ACCESS_UNLOCK_DURATION_MS,
      "Tự động đóng cửa sau lệnh mở trực tiếp"
    );
  }
  res.status(202).json({ ok: true, hardware });
}));
