import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://sentinel:sentinel@localhost:5432/sentinel?schema=public";
const { initialHardwareState } = await import("../src/domain.js");
const { stateForLegacyCommand } = await import("../src/services/hardware-service.js");
const { hardwareStateSchema } = await import("../src/schemas.js");

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
