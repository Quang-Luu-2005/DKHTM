import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler, validate } from "../middleware/http.js";
import { commandSchema, hardwareStateSchema } from "../schemas.js";
import { getHardwareState, queueHardwareUpdate, stateForLegacyCommand } from "../services/hardware-service.js";

export const hardwareRouter = Router();
hardwareRouter.get("/", asyncHandler(async (_req, res) => res.json(await getHardwareState())));
hardwareRouter.put("/", validate(hardwareStateSchema), asyncHandler(async (req, res) => {
  res.status(202).json(await queueHardwareUpdate(req.validated.body));
}));
hardwareRouter.post("/command", validate(commandSchema), asyncHandler(async (req, res) => {
  const current = await getHardwareState(config.DEFAULT_GATE_ID);
  const desired = stateForLegacyCommand(req.validated.body.command, current.desiredState);
  res.status(202).json({ ok: true, hardware: await queueHardwareUpdate(desired, { subjectName: `Hardware ${req.validated.body.command}` }) });
}));
