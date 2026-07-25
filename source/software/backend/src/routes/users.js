import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { asyncHandler, validate } from "../middleware/http.js";
import { faceEnrollmentSchema, userSchema } from "../schemas.js";
import { enrollUserFace, getUserPortrait } from "../services/face-enrollment-service.js";
import { deleteUser, listUsers, saveUser } from "../services/user-service.js";

export const usersRouter = Router();
const portraitUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.FACE_UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const supported = new Set(["image/jpeg", "image/png", "image/webp"]);
    callback(supported.has(file.mimetype) ? null : new Error("Only JPEG, PNG, or WebP portraits are supported"), supported.has(file.mimetype));
  }
}).single("portrait");

function uploadPortrait(req, _res, next) {
  portraitUpload(req, _res, error => {
    if (error) {
      error.statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    }
    next(error);
  });
}

usersRouter.get("/", asyncHandler(async (_req, res) => res.json(await listUsers())));
usersRouter.post("/enroll", uploadPortrait, validate(faceEnrollmentSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await enrollUserFace(req.validated.body, req.file));
}));
usersRouter.post("/", validate(userSchema), asyncHandler(async (req, res) => res.status(200).json(await saveUser(req.validated.body))));
usersRouter.get("/:id/portrait", asyncHandler(async (req, res, next) => {
  const portrait = await getUserPortrait(req.params.id);
  if (!portrait) return res.sendStatus(404);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("ETag", `"${portrait.imageSha256}"`);
  res.type(portrait.imageMimeType);
  res.sendFile(path.resolve(portrait.imagePath), error => {
    if (error) next(error);
  });
}));
usersRouter.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await deleteUser(req.params.id);
  res.sendStatus(deleted ? 204 : 404);
}));
