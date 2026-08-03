import "dotenv/config";
import { app } from "./src/app.js";
import { config } from "./src/config.js";
import { prisma } from "./src/prisma.js";
import { startDeviceOfflineMonitor } from "./src/services/device-service.js";

await prisma.$connect();
const stopOfflineMonitor = startDeviceOfflineMonitor();
const server = app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Sentinel backend listening on http://0.0.0.0:${config.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  stopOfflineMonitor();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
