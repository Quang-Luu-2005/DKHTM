import path from "node:path";
import express, { Router } from "express";
import { asyncHandler, requireDevice, validate } from "../middleware/http.js";
import { deviceEventSchema, snapshotQuerySchema } from "../schemas.js";
import { getDevice, ingestDeviceEvent } from "../services/device-service.js";
import { findSnapshot, latestSnapshot, saveSnapshot } from "../services/snapshot-service.js";

export const devicesRouter = Router();
devicesRouter.post("/events", requireDevice, validate(deviceEventSchema), asyncHandler(async (req, res) => {
  const result = await ingestDeviceEvent(req.validated.body);
  res.status(result.duplicate ? 200 : 201).json({ ok: true, duplicate: result.duplicate });
}));
devicesRouter.post("/camera/snapshot", requireDevice, express.raw({ type: "image/jpeg", limit: "8mb" }), validate(snapshotQuerySchema, "query"), asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "JPEG body is required" });
  const snapshot = await saveSnapshot(req.body, req.validated.query);
  res.status(201).json({ ok: true, ...snapshot });
}));
devicesRouter.get("/camera/snapshot/latest", asyncHandler(async (_req, res) => {
  const snapshot = await latestSnapshot();
  if (!snapshot) return res.sendStatus(404);
  res.type(snapshot.mimeType).sendFile(path.resolve(snapshot.filePath));
}));
devicesRouter.get("/camera/snapshot/:id", asyncHandler(async (req, res) => {
  const snapshot = await findSnapshot(req.params.id);
  if (!snapshot) return res.sendStatus(404);
  res.type(snapshot.mimeType).sendFile(path.resolve(snapshot.filePath));
}));
devicesRouter.get("/:id", asyncHandler(async (req, res) => {
  const device = await getDevice(req.params.id);
  res.json(device || { deviceId: req.params.id, online: false });
}));
