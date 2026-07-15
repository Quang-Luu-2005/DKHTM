import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  DEVICE_SECRET: z.string().min(8).default("demo-secret"),
  CONTROLLER_URL: z.string().url().optional().or(z.literal("")),
  CONTROLLER_DEVICE_ID: z.string().min(1).default("MAIN_CONTROLLER_001"),
  DEFAULT_GATE_ID: z.string().min(1).default("GATE_01"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  COMMAND_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  DEVICE_OFFLINE_AFTER_MS: z.coerce.number().int().positive().default(45000),
  UPLOAD_DIR: z.string().default(path.join(rootDir, "uploads"))
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid backend environment: ${message}`);
}

export const config = {
  ...parsed.data,
  CONTROLLER_URL: parsed.data.CONTROLLER_URL?.replace(/\/$/, "") || null,
  rootDir
};
