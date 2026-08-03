import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://sentinel:sentinel@localhost:5432/sentinel?schema=public";
const { initialHardwareState } = await import("../src/domain.js");
const { stateForLegacyCommand } = await import("../src/services/hardware-service.js");
const { clearGrantLeases, hasActiveGrantLease, registerGrantLease } = await import("../src/services/access-service.js");
const { hardwareStateSchema, userSchema } = await import("../src/schemas.js");
const { classifyDeviceEvent, finalizeRfidDecision, normalizeRfidUid } = await import("../src/services/access-policy.js");
const { cosineSimilarity, findBestFaceMatch } = await import("../src/services/face-matching.js");

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

test("user edits accept the same-origin portrait URL returned by the API", () => {
  const user = userSchema.parse({
    id: "SENT-001",
    fullName: "Nguyen Van A",
    role: "Technician",
    rfidUid: "A1:B2:C3:D4",
    faceIdStatus: "ENROLLED",
    avatarUrl: "/api/users/SENT-001/portrait"
  });
  assert.equal(user.avatarUrl, "/api/users/SENT-001/portrait");
});

test("a valid grant lease protects the open gate until it expires", () => {
  clearGrantLeases();
  registerGrantLease("GATE-LEASE", 5000, 1000);
  assert.equal(hasActiveGrantLease("GATE-LEASE", 5999), true);
  assert.equal(hasActiveGrantLease("GATE-LEASE", 6000), false);
});

test("legacy face claims fail closed while RFID events produce explicit access decisions", () => {
  const face = classifyDeviceEvent({
    eventType: "FACE_RECOGNIZED",
    message: "Recognized Nguyen Van A",
    recognized: true,
    recognizedName: "Nguyen Van A",
    confidence: 0.91
  });
  assert.equal(face.decision, null);
  assert.equal(face.accessMethod, "FACE_ID");
  assert.equal(face.status, "VIOLATION");
  assert.match(face.subjectName, /không được tin cậy/);

  const unknownFace = classifyDeviceEvent({
    eventType: "FACE_DENIED",
    message: "Unknown face",
    confidence: 0.42
  });
  assert.equal(unknownFace.decision, null);
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

test("face matching normalizes vectors, filters model and enforces threshold", () => {
  assert.equal(cosineSimilarity([10, 0, 0], [2, 0, 0]), 1);
  const profiles = [
    {
      id: "profile-a",
      model: "esp-dl-face-112-s8-v1",
      dimension: 3,
      embedding: [0.8, 0.6, 0],
      user: { id: "SENT-A", fullName: "User A" }
    },
    {
      id: "profile-other-model",
      model: "another-model",
      dimension: 3,
      embedding: [1, 0, 0],
      user: { id: "SENT-B", fullName: "User B" }
    }
  ];
  const granted = findBestFaceMatch({
    vector: [1, 0, 0],
    model: "esp-dl-face-112-s8-v1",
    profiles,
    threshold: 0.75
  });
  assert.equal(granted.matched, true);
  assert.equal(granted.profile.user.id, "SENT-A");
  assert.ok(Math.abs(granted.similarity - 0.8) < 1e-9);

  const denied = findBestFaceMatch({
    vector: [1, 0, 0],
    model: "esp-dl-face-112-s8-v1",
    profiles,
    threshold: 0.9
  });
  assert.equal(denied.matched, false);
  assert.equal(denied.reason, "BELOW_THRESHOLD");
});
