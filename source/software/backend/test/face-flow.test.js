import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  cosineSimilarity,
  findBestFaceMatch,
  normalizeEmbedding
} from "../src/services/face-matching.js";

const integrationEnabled = process.env.RUN_INTEGRATION === "1";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections?.();
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function waitFor(check, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for asynchronous face-flow state");
}

async function postDeviceEvent(baseUrl, secret, body) {
  return fetch(`${baseUrl}/api/device/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-secret": secret
    },
    body: JSON.stringify(body)
  });
}

test("cosine matching normalizes vectors and applies the threshold inclusively", () => {
  assert.deepEqual(normalizeEmbedding([3, 4]), [0.6, 0.8]);
  assert.ok(Math.abs(cosineSimilarity([2, 0], [7, 0]) - 1) < 1e-12);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 3])) < 1e-12);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [-5, 0]) + 1) < 1e-12);

  const profiles = [
    {
      id: "wrong-model",
      model: "other-model",
      dimension: 3,
      embedding: [1, 0, 0]
    },
    {
      id: "best",
      model: "esp-dl-test",
      dimension: 3,
      embedding: [0.8, 0.6, 0]
    },
    {
      id: "orthogonal",
      model: "esp-dl-test",
      dimension: 3,
      embedding: [0, 0, 1]
    }
  ];
  const atThreshold = findBestFaceMatch({
    vector: [1, 0, 0],
    model: "esp-dl-test",
    profiles,
    threshold: 0.8
  });
  assert.equal(atThreshold.matched, true);
  assert.equal(atThreshold.reason, "MATCHED");
  assert.equal(atThreshold.profile.id, "best");
  assert.ok(Math.abs(atThreshold.similarity - 0.8) < 1e-12);

  const belowThreshold = findBestFaceMatch({
    vector: [1, 0, 0],
    model: "esp-dl-test",
    profiles,
    threshold: 0.81
  });
  assert.equal(belowThreshold.matched, false);
  assert.equal(belowThreshold.reason, "BELOW_THRESHOLD");
  assert.equal(belowThreshold.profile.id, "best");
});

test("face matching rejects invalid probes and ignores incompatible profiles", () => {
  assert.throws(() => normalizeEmbedding([]), /non-empty numeric array/);
  assert.throws(() => normalizeEmbedding([0, 0]), /zero magnitude/);
  assert.throws(() => normalizeEmbedding([1, Number.NaN]), /non-finite/);
  assert.throws(() => cosineSimilarity([1, 0], [1]), /dimension/);

  const result = findBestFaceMatch({
    vector: [1, 0, 0],
    model: "esp-dl-test",
    profiles: [
      { model: "different", dimension: 3, embedding: [1, 0, 0] },
      { model: "esp-dl-test", dimension: 2, embedding: [1, 0] },
      { model: "esp-dl-test", dimension: 3, embedding: [0, 0, 0] }
    ],
    threshold: 0.55
  });
  assert.equal(result.matched, false);
  assert.equal(result.reason, "NO_COMPATIBLE_PROFILE");
  assert.equal(result.profile, null);
});

test("multipart enrollment and distance-gated face/RFID access flow", { skip: !integrationEnabled }, async () => {
  const secret = "face-flow-integration-secret";
  const userId = "FACE-FLOW-USER";
  const enrolledRfid = "A1:B2:C3:D4";
  const model = "esp-dl-integration-v1";
  const enrolledEmbedding = [1, 0, 0];
  const gates = {
    grant: "FACE_FLOW_GRANT",
    deny: "FACE_FLOW_DENY",
    outside: "FACE_FLOW_OUTSIDE",
    rfid: "FACE_FLOW_RFID"
  };
  const cameraDeviceId = "ESP32CAM_FACE_FLOW_TEST";
  const controllerDeviceId = "CONTROLLER_FACE_FLOW_TEST";
  const uploadedJpegs = [];
  const controllerCommands = [];
  const controllerSecrets = [];
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-face-flow-"));

  const camera = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/face/embedding") {
      response.writeHead(404).end();
      return;
    }
    const body = await readBody(request);
    uploadedJpegs.push({
      body,
      contentType: request.headers["content-type"],
      secret: request.headers["x-device-secret"]
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      model,
      dimension: enrolledEmbedding.length,
      vector: enrolledEmbedding
    }));
  });
  const controller = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/api/hardware/command") {
      response.writeHead(404).end();
      return;
    }
    const command = JSON.parse((await readBody(request)).toString("utf8"));
    controllerCommands.push(command);
    controllerSecrets.push(request.headers["x-device-secret"]);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      commandId: command.commandId,
      hardware: command.desiredState
    }));
  });

  let apiServer;
  let prisma;
  let sharp;
  let cleanupDatabase = async () => {};
  try {
    const [cameraPort, controllerPort] = await Promise.all([
      listen(camera),
      listen(controller)
    ]);
    process.env.DATABASE_URL ||= "postgresql://sentinel:sentinel@localhost:5432/sentinel?schema=public";
    process.env.NODE_ENV = "test";
    process.env.DEVICE_SECRET = secret;
    process.env.CAMERA_URL = `http://127.0.0.1:${cameraPort}`;
    process.env.CONTROLLER_URL = `http://127.0.0.1:${controllerPort}`;
    process.env.CONTROLLER_DEVICE_ID = controllerDeviceId;
    process.env.UPLOAD_DIR = uploadDir;
    process.env.FACE_MATCH_THRESHOLD = "0.8";
    process.env.FACE_PRESENCE_WINDOW_MS = "5000";
    process.env.ACCESS_UNLOCK_DURATION_MS = "60000";
    process.env.DENIED_SIGNAL_DURATION_MS = "60000";
    process.env.COMMAND_TIMEOUT_MS = "500";
    process.env.COMMAND_MAX_ATTEMPTS = "1";

    const modules = await Promise.all([
      import("../src/app.js"),
      import("../src/prisma.js"),
      import("sharp")
    ]);
    const app = modules[0].app;
    prisma = modules[1].prisma;
    sharp = modules[2].default;
    apiServer = http.createServer(app);
    const apiPort = await listen(apiServer);
    const baseUrl = `http://127.0.0.1:${apiPort}`;
    const gateIds = Object.values(gates);
    const cameraIds = [cameraDeviceId];

    cleanupDatabase = async () => {
      await prisma.auditLog.deleteMany({ where: { gateId: { in: gateIds } } });
      await prisma.deviceEvent.deleteMany({ where: { deviceId: { in: cameraIds } } });
      await prisma.hardwareCommand.deleteMany({ where: { gateId: { in: gateIds } } });
      await prisma.gateHardwareState.deleteMany({ where: { gateId: { in: gateIds } } });
      await prisma.device.deleteMany({
        where: { id: { in: [...cameraIds, controllerDeviceId] } }
      });
      await prisma.user.deleteMany({ where: { id: userId } });
    };
    await cleanupDatabase();

    const portrait = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 180, g: 140, b: 120 }
      }
    }).jpeg().toBuffer();
    const enrollment = new FormData();
    enrollment.set("id", userId);
    enrollment.set("fullName", "Face Flow User");
    enrollment.set("role", "Technician");
    enrollment.set("rfidUid", enrolledRfid);
    enrollment.set("portrait", new Blob([portrait], { type: "image/jpeg" }), "portrait.jpg");

    const enrollResponse = await fetch(`${baseUrl}/api/users/enroll`, {
      method: "POST",
      body: enrollment
    });
    const enrolledUser = await enrollResponse.json();
    assert.equal(
      enrollResponse.status,
      201,
      `Enrollment failed: ${JSON.stringify(enrolledUser)}`
    );
    assert.equal(enrolledUser.id, userId);
    assert.equal(enrolledUser.faceIdStatus, "ENROLLED");
    assert.match(enrolledUser.avatarUrl, new RegExp(`/api/users/${userId}/portrait$`));
    assert.equal(uploadedJpegs.length, 1);
    assert.equal(uploadedJpegs[0].secret, secret);
    assert.equal(uploadedJpegs[0].contentType, "image/jpeg");
    assert.deepEqual([...uploadedJpegs[0].body.subarray(0, 2)], [0xff, 0xd8]);

    const profile = await prisma.faceProfile.findUnique({ where: { userId } });
    assert.ok(profile, "Enrollment must persist a FaceProfile");
    assert.equal(profile.model, model);
    assert.equal(profile.dimension, enrolledEmbedding.length);
    assert.deepEqual(profile.embedding, enrolledEmbedding);
    assert.ok(profile.imagePath);

    const presenceBase = {
      deviceId: cameraDeviceId,
      source: "MAIN_CONTROLLER",
      eventType: "PRESENCE_DETECTED",
      message: "Person within configured recognition distance",
      distanceCm: 62
    };
    const embeddingBase = {
      deviceId: cameraDeviceId,
      source: "ESP32_CAM",
      eventType: "FACE_EMBEDDING",
      message: "Face embedding extracted",
      model,
      dimension: enrolledEmbedding.length
    };

    let response = await postDeviceEvent(baseUrl, secret, {
      ...presenceBase,
      eventId: "face-flow-presence-grant",
      gateId: gates.grant
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).accessDecision, null);

    response = await postDeviceEvent(baseUrl, secret, {
      ...embeddingBase,
      eventId: "face-flow-embedding-grant",
      gateId: gates.grant,
      vector: [0.9, 0.1, 0]
    });
    assert.equal(response.status, 201);
    const granted = await response.json();
    assert.equal(granted.accessDecision, "GRANT");
    await waitFor(() => controllerCommands.find(command =>
      command.gateId === gates.grant && command.desiredState?.servoLocked === false
    ));
    assert.ok(controllerSecrets.includes(secret), "Backend must authenticate controller commands");
    const grantLog = await prisma.auditLog.findFirst({
      where: { gateId: gates.grant },
      orderBy: { timestamp: "desc" }
    });
    assert.equal(grantLog.subjectId, userId);
    assert.equal(grantLog.status, "ONLINE");
    assert.equal(grantLog.accessMethod, "FACE_ID");

    const commandsAfterGrant = controllerCommands.length;
    response = await postDeviceEvent(baseUrl, secret, {
      ...presenceBase,
      eventId: "face-flow-presence-deny-during-grant",
      gateId: gates.grant
    });
    assert.equal(response.status, 201);
    response = await postDeviceEvent(baseUrl, secret, {
      ...embeddingBase,
      eventId: "face-flow-embedding-deny-during-grant",
      gateId: gates.grant,
      vector: [0.7, Math.sqrt(0.51), 0]
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).accessDecision, "DENY");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(
      controllerCommands.length,
      commandsAfterGrant,
      "A DENY must not relock or signal while an earlier grant lease is active"
    );

    response = await postDeviceEvent(baseUrl, secret, {
      ...presenceBase,
      eventId: "face-flow-presence-deny",
      gateId: gates.deny
    });
    assert.equal(response.status, 201);
    response = await postDeviceEvent(baseUrl, secret, {
      ...embeddingBase,
      eventId: "face-flow-embedding-deny",
      gateId: gates.deny,
      vector: [0.7, Math.sqrt(0.51), 0]
    });
    assert.equal(response.status, 201);
    const denied = await response.json();
    assert.equal(denied.accessDecision, "DENY");
    await waitFor(() => controllerCommands.find(command =>
      command.gateId === gates.deny && command.desiredState?.systemBuzzer === "ACTIVE"
    ));
    assert.equal(
      controllerCommands.some(command =>
        command.gateId === gates.deny && command.desiredState?.servoLocked === false
      ),
      false,
      "A face below threshold must never receive an open command"
    );
    const denyLog = await prisma.auditLog.findFirst({
      where: { gateId: gates.deny },
      orderBy: { timestamp: "desc" }
    });
    assert.equal(denyLog.status, "VIOLATION");
    assert.equal(denyLog.accessMethod, "FACE_ID");

    response = await postDeviceEvent(baseUrl, secret, {
      ...embeddingBase,
      eventId: "face-flow-embedding-outside-window",
      gateId: gates.outside,
      vector: enrolledEmbedding
    });
    assert.equal(response.status, 201);
    const outsideWindow = await response.json();
    assert.equal(outsideWindow.accessDecision, null);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(
      controllerCommands.some(command => command.gateId === gates.outside),
      false,
      "An embedding outside a proximity window must not control hardware"
    );
    assert.equal(
      await prisma.deviceEvent.count({
        where: {
          deviceId: cameraDeviceId,
          eventId: "face-flow-embedding-outside-window"
        }
      }),
      0,
      "An embedding outside a proximity window must not be stored as an access attempt"
    );

    response = await postDeviceEvent(baseUrl, secret, {
      eventId: "face-flow-rfid-grant",
      deviceId: cameraDeviceId,
      gateId: gates.rfid,
      source: "MAIN_CONTROLLER",
      eventType: "RFID_SCANNED",
      message: "RFID scanned",
      rfidUid: "a1 b2-c3:d4"
    });
    assert.equal(response.status, 201);
    const rfidGrant = await response.json();
    assert.equal(rfidGrant.accessDecision, "GRANT");
    await waitFor(() => controllerCommands.find(command =>
      command.gateId === gates.rfid && command.desiredState?.servoLocked === false
    ));
    const rfidLog = await prisma.auditLog.findFirst({
      where: { gateId: gates.rfid },
      orderBy: { timestamp: "desc" }
    });
    assert.equal(rfidLog.subjectId, userId);
    assert.equal(rfidLog.accessMethod, "RFID");
    assert.equal(rfidLog.status, "ONLINE");

    await cleanupDatabase();
  } finally {
    if (prisma) await cleanupDatabase();
    await Promise.allSettled([
      close(camera),
      close(controller),
      apiServer ? close(apiServer) : Promise.resolve()
    ]);
    if (prisma) await prisma.$disconnect();
    await fs.rm(uploadDir, { recursive: true, force: true });
  }
});
