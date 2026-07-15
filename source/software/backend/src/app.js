import express from "express";
import { connectedClientCount, openEventStream } from "./events/sse.js";
import { asyncHandler, cors, errorHandler, notFound } from "./middleware/http.js";
import { prisma } from "./prisma.js";
import { devicesRouter } from "./routes/devices.js";
import { hardwareRouter } from "./routes/hardware.js";
import { logsRouter } from "./routes/logs.js";
import { usersRouter } from "./routes/users.js";
import { config } from "./config.js";

export const app = express();
app.disable("x-powered-by");
app.use(cors);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, database: "connected", controllerConfigured: Boolean(config.CONTROLLER_URL), sseClients: connectedClientCount() });
}));
app.get("/api/events", openEventStream);
app.use("/api/users", usersRouter);
app.use("/api/logs", logsRouter);
app.use("/api/hardware", hardwareRouter);
app.use("/api/device", devicesRouter);
app.use(notFound);
app.use(errorHandler);
