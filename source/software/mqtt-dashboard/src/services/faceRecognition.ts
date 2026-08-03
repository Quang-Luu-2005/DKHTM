import type { User } from "../types";

const MODEL_URL = "/models";
const MATCH_DISTANCE_THRESHOLD = 0.48;
const descriptorCache = new Map<string, Float32Array>();
let modelsPromise: Promise<void> | null = null;
let faceApiPromise: Promise<typeof import("@vladmandic/face-api")> | null = null;

function getFaceApi() {
  if (!faceApiPromise) faceApiPromise = import("@vladmandic/face-api");
  return faceApiPromise;
}

export interface FaceRecognitionResult {
  authorized: boolean;
  employeeId?: string;
  employeeName?: string;
  confidence: number;
  distance?: number;
  reason: "face_matched" | "face_not_matched" | "no_face_detected" | "no_face_database";
}

export function loadFaceModels() {
  if (!modelsPromise) {
    modelsPromise = getFaceApi().then((faceapi) => Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]).then(() => undefined));
  }
  return modelsPromise;
}

async function imageFromUrl(url: string) {
  const faceapi = await getFaceApi();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được ảnh: HTTP ${response.status}`);
  return faceapi.bufferToImage(await response.blob());
}

async function extractDescriptor(image: HTMLImageElement) {
  const faceapi = await getFaceApi();
  const detection = await faceapi
    .detectSingleFace(
      image,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }),
    )
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor;
}

export async function detectClearFaceInCurrentCameraFrame(): Promise<boolean> {
  await loadFaceModels();
  const faceapi = await getFaceApi();
  const cameraImage = await imageFromUrl(`/api/camera/capture?presence=${Date.now()}`);
  const detection = await faceapi.detectSingleFace(
    cameraImage,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.65 }),
  );

  if (!detection) return false;
  const imageWidth = cameraImage.naturalWidth || cameraImage.width;
  const imageHeight = cameraImage.naturalHeight || cameraImage.height;
  return detection.box.width >= imageWidth * 0.2 && detection.box.height >= imageHeight * 0.2;
}

async function descriptorForUser(user: User) {
  if (!user.avatarUrl) return null;
  const cacheKey = `${user.id}:${user.avatarUrl.length}:${user.avatarUrl.slice(0, 80)}`;
  const cached = descriptorCache.get(cacheKey);
  if (cached) return cached;

  try {
    const descriptor = await extractDescriptor(await imageFromUrl(user.avatarUrl));
    if (descriptor) descriptorCache.set(cacheKey, descriptor);
    return descriptor || null;
  } catch (error) {
    console.warn(`Không tạo được mẫu khuôn mặt cho ${user.fullName}:`, error);
    return null;
  }
}

function euclideanDistance(first: Float32Array, second: Float32Array) {
  let sum = 0;
  for (let index = 0; index < first.length; index++) {
    const difference = first[index] - second[index];
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}

export async function recognizeCurrentCameraFace(users: User[]): Promise<FaceRecognitionResult> {
  await loadFaceModels();

  const cameraImage = await imageFromUrl(`/api/camera/capture?timestamp=${Date.now()}`);
  const cameraDescriptor = await extractDescriptor(cameraImage);
  if (!cameraDescriptor) {
    return { authorized: false, confidence: 0, reason: "no_face_detected" };
  }

  const enrolledUsers = users.filter(
    (user) => user.faceIdStatus === "ENROLLED" && Boolean(user.avatarUrl),
  );
  let bestMatch: { user: User; distance: number } | null = null;

  for (const user of enrolledUsers) {
    const descriptor = await descriptorForUser(user);
    if (!descriptor) continue;
    const distance = euclideanDistance(cameraDescriptor, descriptor);
    if (!bestMatch || distance < bestMatch.distance) bestMatch = { user, distance };
  }

  if (!bestMatch) {
    return { authorized: false, confidence: 0, reason: "no_face_database" };
  }

  const confidence = Math.max(0, Math.min(100, Math.round((1 - bestMatch.distance) * 100)));
  if (bestMatch.distance > MATCH_DISTANCE_THRESHOLD) {
    return {
      authorized: false,
      confidence,
      distance: bestMatch.distance,
      reason: "face_not_matched",
    };
  }

  return {
    authorized: true,
    employeeId: bestMatch.user.id,
    employeeName: bestMatch.user.fullName,
    confidence,
    distance: bestMatch.distance,
    reason: "face_matched",
  };
}
