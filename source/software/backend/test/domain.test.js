import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://sentinel:sentinel@localhost:5432/sentinel?schema=public";
const { initialHardwareState } = await import("../src/domain.js");
const { stateForLegacyCommand } = await import("../src/services/hardware-service.js");
const { hardwareStateSchema } = await import("../src/schemas.js");
const { classifyDeviceEvent, finalizeRfidDecision, normalizeRfidUid } = await import("../src/services/access-policy.js");

test("legacy hardware commands map to dashboard-compatible states", () => {
  assert.deepEqual(stateForLegacyCommand("lock", initialHardwareState), {
    servoArm: "SECURED / CLOSED",
    servoLocked: true,
    indicatorLed: "RED / RESTRICTED",
    systemBuzzer: "MUTED"
  });
  assert.equal(stateForLegacyCommand("grant", initialHardwareState).servoLocked, false);
  assert.equal(stateForLegacyCommand("deny", initialHardwareState).systemBuzzer, "ACTIVE");
});

test("hardware state schema rejects incomplete commands", () => {
  assert.throws(() => hardwareStateSchema.parse({ servoLocked: true }), /Invalid/);
  assert.equal(hardwareStateSchema.parse(initialHardwareState).indicatorLed, "RED / RESTRICTED");
});

test("camera recognition and RFID events produce explicit access decisions", () => {
  const face = classifyDeviceEvent({
    eventType: "FACE_RECOGNIZED",
    message: "Recognized Nguyen Van A",
    recognized: true,
    recognizedName: "Nguyen Van A",
    confidence: 0.91
  });
  assert.equal(face.decision, "GRANT");
  assert.equal(face.accessMethod, "FACE_ID");
  assert.equal(face.subjectName, "Nguyen Van A");

  const unknownFace = classifyDeviceEvent({
    eventType: "FACE_DENIED",
    message: "Unknown face",
    confidence: 0.42
  });
  assert.equal(unknownFace.decision, "DENY");
  assert.equal(unknownFace.status, "VIOLATION");

  const uid = normalizeRfidUid("a1 b2-c3:d4");
  assert.equal(uid, "A1:B2:C3:D4");
  const grantedCard = finalizeRfidDecision(
    classifyDeviceEvent({ eventType: "RFID_SCANNED", message: "RFID scanned" }),
    { id: "SENT-001", fullName: "RFID User" },
    uid
  );
  assert.equal(grantedCard.decision, "GRANT");
  assert.equal(grantedCard.subjectId, "SENT-001");
});
