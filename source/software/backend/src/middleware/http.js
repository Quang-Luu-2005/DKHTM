import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { config } from "../config.js";

export function cors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", config.FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-device-secret, Last-Event-ID");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

export function requireDevice(req, res, next) {
  const supplied = Buffer.from(req.get("x-device-secret") || "");
  const expected = Buffer.from(config.DEVICE_SECRET);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: "Invalid device secret" });
  }
  next();
}

export function validate(schema, source = "body") {
  return (req, _res, next) => {
    req.validated ||= {};
    req.validated[source] = schema.parse(req[source]);
    next();
  };
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: error.issues });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return res.status(409).json({ error: "Resource already exists", target: error.meta?.target });
    if (error.code === "P2025") return res.status(404).json({ error: "Resource not found" });
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}
