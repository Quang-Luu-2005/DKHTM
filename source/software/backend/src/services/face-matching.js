const MAX_EMBEDDING_DIMENSION = 2048;

export function normalizeEmbedding(value, expectedDimension) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EMBEDDING_DIMENSION) {
    throw new TypeError("Face embedding must be a non-empty numeric array");
  }
  if (expectedDimension !== undefined && value.length !== expectedDimension) {
    throw new TypeError(`Face embedding dimension must be ${expectedDimension}`);
  }

  const vector = value.map(component => Number(component));
  if (vector.some(component => !Number.isFinite(component))) {
    throw new TypeError("Face embedding contains a non-finite component");
  }

  const magnitude = Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0));
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new TypeError("Face embedding has zero magnitude");
  }
  return vector.map(component => component / magnitude);
}

export function cosineSimilarity(left, right) {
  const normalizedLeft = normalizeEmbedding(left);
  const normalizedRight = normalizeEmbedding(right, normalizedLeft.length);
  return normalizedLeft.reduce((sum, component, index) => sum + component * normalizedRight[index], 0);
}

export function findBestFaceMatch({ vector, model, profiles, threshold }) {
  const normalizedProbe = normalizeEmbedding(vector);
  const normalizedModel = String(model || "").trim();
  if (!normalizedModel) throw new TypeError("Face model is required");
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    throw new TypeError("Face match threshold must be between -1 and 1");
  }

  let best = null;
  for (const profile of profiles) {
    if (profile.model !== normalizedModel || profile.dimension !== normalizedProbe.length) continue;
    try {
      const enrolled = normalizeEmbedding(profile.embedding, normalizedProbe.length);
      const similarity = normalizedProbe.reduce((sum, component, index) => sum + component * enrolled[index], 0);
      if (best === null || similarity > best.similarity) best = { profile, similarity };
    } catch {
      // A malformed stored profile is ignored rather than making every access attempt fail.
    }
  }

  if (best === null) {
    return {
      matched: false,
      reason: "NO_COMPATIBLE_PROFILE",
      similarity: null,
      threshold,
      dimension: normalizedProbe.length,
      model: normalizedModel,
      profile: null
    };
  }

  return {
    matched: best.similarity >= threshold,
    reason: best.similarity >= threshold ? "MATCHED" : "BELOW_THRESHOLD",
    similarity: best.similarity,
    threshold,
    dimension: normalizedProbe.length,
    model: normalizedModel,
    profile: best.profile
  };
}
