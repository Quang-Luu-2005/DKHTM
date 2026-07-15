import { Router } from "express";
import { asyncHandler, validate } from "../middleware/http.js";
import { auditLogSchema } from "../schemas.js";
import { createAuditLog, listAuditLogs } from "../services/audit-service.js";

export const logsRouter = Router();
logsRouter.get("/", asyncHandler(async (_req, res) => res.json(await listAuditLogs())));
logsRouter.post("/", validate(auditLogSchema), asyncHandler(async (req, res) => res.status(201).json(await createAuditLog(req.validated.body))));
