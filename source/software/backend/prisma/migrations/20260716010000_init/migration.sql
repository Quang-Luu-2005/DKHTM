CREATE TYPE "UserRole" AS ENUM ('ADMINISTRATOR', 'SECURITY_OFFICER', 'TECHNICIAN', 'GENERAL_STAFF');
CREATE TYPE "FaceIdStatus" AS ENUM ('ENROLLED', 'PENDING');
CREATE TYPE "AccessMethod" AS ENUM ('FACE_ID', 'RFID', 'MANUAL_OVERRIDE', 'GATE_JUMPING', 'TAILGATING');
CREATE TYPE "AuditStatus" AS ENUM ('ONLINE', 'VIOLATION', 'EXPIRED');
CREATE TYPE "DeviceType" AS ENUM ('CAMERA', 'CONTROLLER');
CREATE TYPE "HardwareConnectionStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'OFFLINE');
CREATE TYPE "HardwareCommandType" AS ENUM ('SET_STATE', 'LOCK', 'GRANT', 'DENY', 'IDLE');
CREATE TYPE "HardwareCommandStatus" AS ENUM ('PENDING', 'SENT', 'ACKED', 'FAILED', 'TIMEOUT');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "rfidUid" TEXT,
    "faceIdStatus" "FaceIdStatus" NOT NULL DEFAULT 'PENDING',
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subjectName" TEXT NOT NULL,
    "subjectId" TEXT,
    "accessMethod" "AccessMethod" NOT NULL,
    "gateId" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL,
    "confidence" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "source" TEXT,
    "deviceId" TEXT,
    "metadata" JSONB,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "name" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "capabilities" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    CONSTRAINT "DeviceEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GateHardwareState" (
    "gateId" TEXT NOT NULL,
    "desiredState" JSONB NOT NULL,
    "reportedState" JSONB NOT NULL,
    "connectionStatus" "HardwareConnectionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastReportedAt" TIMESTAMP(3),
    "lastCommandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GateHardwareState_pkey" PRIMARY KEY ("gateId")
);

CREATE TABLE "HardwareCommand" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "targetDeviceId" TEXT,
    "command" "HardwareCommandType" NOT NULL,
    "requestedState" JSONB NOT NULL,
    "status" "HardwareCommandStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "ackPayload" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HardwareCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT,
    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_fullName_idx" ON "User"("fullName");
CREATE INDEX "User_rfidUid_idx" ON "User"("rfidUid");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp" DESC);
CREATE INDEX "AuditLog_gateId_timestamp_idx" ON "AuditLog"("gateId", "timestamp" DESC);
CREATE INDEX "AuditLog_deviceId_idx" ON "AuditLog"("deviceId");
CREATE INDEX "Device_gateId_idx" ON "Device"("gateId");
CREATE INDEX "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");
CREATE INDEX "DeviceEvent_receivedAt_idx" ON "DeviceEvent"("receivedAt" DESC);
CREATE UNIQUE INDEX "DeviceEvent_deviceId_eventId_key" ON "DeviceEvent"("deviceId", "eventId");
CREATE UNIQUE INDEX "HardwareCommand_commandId_key" ON "HardwareCommand"("commandId");
CREATE INDEX "HardwareCommand_gateId_createdAt_idx" ON "HardwareCommand"("gateId", "createdAt" DESC);
CREATE INDEX "HardwareCommand_status_idx" ON "HardwareCommand"("status");
CREATE INDEX "Snapshot_capturedAt_idx" ON "Snapshot"("capturedAt" DESC);
CREATE INDEX "Snapshot_deviceId_capturedAt_idx" ON "Snapshot"("deviceId", "capturedAt" DESC);

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HardwareCommand" ADD CONSTRAINT "HardwareCommand_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
