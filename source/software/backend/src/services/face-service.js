import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { findBestFaceMatch, normalizeEmbedding } from "./face-matching.js";

const presenceWindows = new Map();

export function openPresenceWindow(gateId, now = Date.now()) {
  const expiresAt = now + config.FACE_PRESENCE_WINDOW_MS;
  presenceWindows.set(gateId, expiresAt);
  return expiresAt;
}

export function consumePresenceWindow(gateId, now = Date.now()) {
  const expiresAt = presenceWindows.get(gateId);
  presenceWindows.delete(gateId);
  return typeof expiresAt === "number" && expiresAt >= now;
}

export function clearPresenceWindows() {
  presenceWindows.clear();
}

export async function resolveFaceEmbedding({ gateId, vector, model }) {
  const dimension = normalizeEmbedding(vector).length;
  if (!consumePresenceWindow(gateId)) {
    return {
      matched: false,
      reason: "OUTSIDE_PRESENCE_WINDOW",
      similarity: null,
      threshold: config.FACE_MATCH_THRESHOLD,
      dimension,
      model,
      profile: null
    };
  }

  const profiles = await prisma.faceProfile.findMany({
    where: {
      model,
      dimension,
      user: { is: { faceIdStatus: "ENROLLED" } }
    },
    include: {
      user: {
        select: { id: true, fullName: true, faceIdStatus: true }
      }
    }
  });
  return findBestFaceMatch({
    vector,
    model,
    profiles,
    threshold: config.FACE_MATCH_THRESHOLD
  });
}

export function finalizeFaceDecision(classification, match) {
  if (classification.decision !== "VERIFY_FACE") return classification;
  if (match.reason === "OUTSIDE_PRESENCE_WINDOW") {
    return {
      ...classification,
      decision: null,
      status: "ONLINE",
      shouldAudit: false,
      faceMatch: {
        reason: match.reason,
        model: match.model,
        dimension: match.dimension,
        similarity: null,
        threshold: match.threshold,
        matchedUserId: null
      }
    };
  }
  const matchedUser = match.matched ? match.profile?.user : null;
  return {
    ...classification,
    decision: matchedUser ? "GRANT" : "DENY",
    status: matchedUser ? "ONLINE" : "VIOLATION",
    subjectName: matchedUser?.fullName || "Khuôn mặt không xác định",
    subjectId: matchedUser?.id || null,
    confidence: match.similarity === null ? "N/A" : `${Math.round(match.similarity * 100)}%`,
    faceMatch: {
      reason: match.reason,
      model: match.model,
      dimension: match.dimension,
      similarity: match.similarity,
      threshold: match.threshold,
      matchedUserId: matchedUser?.id || null
    }
  };
}
