import { createHash } from "node:crypto";
import sharp from "sharp";
import { config } from "../config.js";
import { roleToDb, serializeUser } from "../domain.js";
import { prisma } from "../prisma.js";
import { normalizeRfidUid } from "./access-policy.js";
import { normalizeEmbedding } from "./face-matching.js";
import { removePortrait, writePortrait } from "./portrait-storage.js";

function serviceError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizedRfid(value) {
  const input = String(value || "").trim();
  return input && input.toUpperCase() !== "NOT LINKED" ? normalizeRfidUid(input) : null;
}

async function normalizePortrait(payload) {
  try {
    return await sharp(payload, {
      failOn: "warning",
      limitInputPixels: 24_000_000
    })
      .rotate()
      .resize(320, 240, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0 }
      })
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .jpeg({ quality: 88, chromaSubsampling: "4:2:0" })
      .toBuffer();
  } catch {
    throw serviceError(422, "Uploaded file is not a supported, decodable portrait image");
  }
}

async function extractEmbeddingWithCamera(jpeg) {
  if (!config.CAMERA_URL) throw serviceError(503, "CAMERA_URL is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.CAMERA_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${config.CAMERA_URL}/face/embedding`, {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(jpeg.length),
        "x-device-secret": config.DEVICE_SECRET
      },
      body: jpeg,
      signal: controller.signal
    });
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "Camera embedding request timed out"
      : "Camera embedding service is unavailable";
    throw serviceError(error?.name === "AbortError" ? 504 : 503, message);
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw serviceError(502, `Camera returned invalid JSON (${response.status})`);
  }
  if (!response.ok || payload?.ok !== true) {
    throw serviceError(response.status >= 400 && response.status < 500 ? 422 : 502, payload?.message || payload?.error || "Camera could not extract a face embedding");
  }

  const rawEmbedding = payload.embedding ?? payload.vector;
  let embedding;
  try {
    embedding = normalizeEmbedding(rawEmbedding);
  } catch (error) {
    throw serviceError(502, `Camera returned an invalid embedding: ${error.message}`);
  }

  const model = String(payload.model || "").trim();
  if (!model || model.length > 128) throw serviceError(502, "Camera response has no valid model identifier");
  const dimension = Number(payload.dimension ?? embedding.length);
  if (!Number.isInteger(dimension) || dimension !== embedding.length) {
    throw serviceError(502, "Camera embedding dimension does not match its vector");
  }
  return { embedding, model, dimension };
}

export async function enrollUserFace(input, uploadedFile) {
  if (!uploadedFile?.buffer?.length) throw serviceError(400, "Multipart field 'portrait' is required");

  const portrait = await normalizePortrait(uploadedFile.buffer);
  const extracted = await extractEmbeddingWithCamera(portrait);
  const previous = await prisma.faceProfile.findUnique({
    where: { userId: input.id },
    select: { imagePath: true }
  });
  const imagePath = await writePortrait(portrait);
  const imageSha256 = createHash("sha256").update(portrait).digest("hex");

  let user;
  try {
    user = await prisma.$transaction(async tx => {
      await tx.user.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          fullName: input.fullName,
          role: roleToDb[input.role],
          rfidUid: normalizedRfid(input.rfidUid),
          faceIdStatus: "ENROLLED",
          avatarUrl: null
        },
        update: {
          fullName: input.fullName,
          role: roleToDb[input.role],
          rfidUid: normalizedRfid(input.rfidUid),
          faceIdStatus: "ENROLLED",
          avatarUrl: null
        }
      });
      await tx.faceProfile.upsert({
        where: { userId: input.id },
        create: {
          userId: input.id,
          embedding: extracted.embedding,
          model: extracted.model,
          dimension: extracted.dimension,
          imagePath,
          imageMimeType: "image/jpeg",
          imageSize: portrait.length,
          imageSha256
        },
        update: {
          embedding: extracted.embedding,
          model: extracted.model,
          dimension: extracted.dimension,
          imagePath,
          imageMimeType: "image/jpeg",
          imageSize: portrait.length,
          imageSha256
        }
      });
      return tx.user.findUnique({
        where: { id: input.id },
        include: { faceProfile: true }
      });
    });
  } catch (error) {
    await removePortrait(imagePath);
    throw error;
  }

  if (previous?.imagePath && previous.imagePath !== imagePath) {
    await removePortrait(previous.imagePath);
  }
  return serializeUser(user);
}

export function getUserPortrait(id) {
  return prisma.faceProfile.findUnique({
    where: { userId: id },
    select: { imagePath: true, imageMimeType: true, imageSha256: true, updatedAt: true }
  });
}
