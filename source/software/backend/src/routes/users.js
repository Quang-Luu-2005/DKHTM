import { Router } from "express";
import { asyncHandler, validate } from "../middleware/http.js";
import { userSchema } from "../schemas.js";
import { deleteUser, listUsers, saveUser } from "../services/user-service.js";

export const usersRouter = Router();
usersRouter.get("/", asyncHandler(async (_req, res) => res.json(await listUsers())));
usersRouter.post("/", validate(userSchema), asyncHandler(async (req, res) => res.status(200).json(await saveUser(req.validated.body))));
usersRouter.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await deleteUser(req.params.id);
  res.sendStatus(deleted ? 204 : 404);
}));
