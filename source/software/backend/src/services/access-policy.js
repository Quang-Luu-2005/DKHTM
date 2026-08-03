const ACCESS_EVENT_PATTERN = /(FACE|RFID|TAILGAT|JUMP|CLIMB|VIOLATION|INTRUSION)/;
const OPERATIONAL_EVENT_PATTERN = /(HEARTBEAT|SNAPSHOT|PERSON_CHECK|PRESENCE_DETECTED)/;

export function normalizeRfidUid(value = "") {
  const hex = String(value).toUpperCase().replace(/[^0-9A-F]/g, "");
  return hex.length >= 4 && hex.length % 2 === 0
    ? hex.match(/.{2}/g).join(":")
    : String(value).trim().toUpperCase();
}

export function classifyDeviceEvent(event) {
  const eventType = event.eventType.toUpperCase();
  const text = `${eventType} ${event.message}`.toUpperCase();
  const isFaceEvent = eventType.includes("FACE");
  const isRfidEvent = eventType.includes("RFID");
  const isTailgating = text.includes("TAILGAT");
  const isGateJumping = /(JUMP|CLIMB|INTRUSION)/.test(text);
  const isUntrustedLegacyFace = eventType === "FACE_RECOGNIZED";
  const denied = /(ERROR|FAILED|MISMATCH|DENIED|UNKNOWN|UNRECOGNIZED|VIOLATION|INTRUSION)/.test(text);

  let accessMethod = "MANUAL_OVERRIDE";
  if (isTailgating) accessMethod = "TAILGATING";
  else if (isGateJumping) accessMethod = "GATE_JUMPING";
  else if (isRfidEvent) accessMethod = "RFID";
  else if (isFaceEvent) accessMethod = "FACE_ID";

  let decision = null;
  if (eventType === "FACE_EMBEDDING") decision = "VERIFY_FACE";
  else if (isFaceEvent) decision = null;
  else if (eventType === "RFID_SCANNED") decision = "VERIFY_RFID";
  else if (isTailgating || isGateJumping || eventType.includes("INTRUSION")) decision = "DENY";

  return {
    accessMethod,
    decision,
    status: denied || isUntrustedLegacyFace || decision === "DENY" ? "VIOLATION" : "ONLINE",
    shouldAudit: ACCESS_EVENT_PATTERN.test(text) || !OPERATIONAL_EVENT_PATTERN.test(eventType),
    subjectName: eventType === "FACE_RECOGNIZED"
      ? "Sự kiện FACE_RECOGNIZED cũ không được tin cậy"
      : (event.recognizedName || event.subjectName || event.message || event.eventType),
    subjectId: event.subjectId || (event.recognizedId === undefined ? null : String(event.recognizedId)),
    confidence: event.confidence === undefined ? "N/A" : `${Math.round(event.confidence * 100)}%`
  };
}

export function finalizeRfidDecision(classification, user, rfidUid) {
  if (classification.decision !== "VERIFY_RFID") return classification;
  if (user) {
    return {
      ...classification,
      decision: "GRANT",
      status: "ONLINE",
      subjectName: user.fullName,
      subjectId: user.id
    };
  }
  return {
    ...classification,
    decision: "DENY",
    status: "VIOLATION",
    subjectName: `RFID không được cấp quyền (${rfidUid || "không rõ UID"})`,
    subjectId: rfidUid || null
  };
}
