export const initialHardwareState = Object.freeze({
  servoArm: "SECURED / CLOSED",
  servoLocked: true,
  indicatorLed: "RED / RESTRICTED",
  systemBuzzer: "MUTED"
});

export const roleToDb = {
  Administrator: "ADMINISTRATOR",
  "Security Officer": "SECURITY_OFFICER",
  Technician: "TECHNICIAN",
  "General Staff": "GENERAL_STAFF"
};
export const roleFromDb = Object.fromEntries(Object.entries(roleToDb).map(([key, value]) => [value, key]));

export const accessMethodToDb = {
  "Face ID": "FACE_ID",
  RFID: "RFID",
  "Manual Override": "MANUAL_OVERRIDE",
  "Gate Jumping / Climbing detected": "GATE_JUMPING",
  "Tailgating detected": "TAILGATING"
};
export const accessMethodFromDb = Object.fromEntries(Object.entries(accessMethodToDb).map(([key, value]) => [value, key]));

export function serializeUser(user) {
  const { faceProfile, createdAt: _createdAt, updatedAt: _updatedAt, ...record } = user;
  const hasFaceProfile = Boolean(faceProfile);
  return {
    ...record,
    role: roleFromDb[user.role],
    rfidUid: user.rfidUid || "NOT LINKED",
    faceIdStatus: hasFaceProfile ? "ENROLLED" : "PENDING",
    avatarUrl: hasFaceProfile ? `/api/users/${encodeURIComponent(user.id)}/portrait` : (user.avatarUrl || undefined),
    faceModel: hasFaceProfile ? faceProfile.model : undefined,
    faceEmbeddingDimension: hasFaceProfile ? faceProfile.dimension : undefined
  };
}

export function serializeAuditLog(log) {
  return {
    id: log.id,
    timestamp: log.timestamp.toISOString().replace("T", " ").slice(0, 19),
    subjectName: log.subjectName,
    subjectId: log.subjectId || undefined,
    accessMethod: accessMethodFromDb[log.accessMethod],
    gateId: log.gateId,
    status: log.status,
    confidence: log.confidence,
    avatarUrl: log.avatarUrl || undefined,
    source: log.source || undefined,
    deviceId: log.deviceId || undefined,
    metadata: log.metadata || undefined
  };
}

export function hardwareResponse(record, command = null) {
  const desired = record?.desiredState || initialHardwareState;
  const reported = record?.reportedState || initialHardwareState;
  return {
    // The top-level fields drive the dashboard and must describe the latest
    // controller report. desiredState remains available for command progress.
    ...reported,
    desiredState: desired,
    reportedState: reported,
    connectionStatus: record?.connectionStatus || "UNKNOWN",
    lastReportedAt: record?.lastReportedAt?.toISOString() || null,
    commandId: command?.commandId || record?.lastCommandId || null,
    commandStatus: command?.status || null
  };
}
