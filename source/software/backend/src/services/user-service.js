import { prisma } from "../prisma.js";
import { roleToDb, serializeUser } from "../domain.js";
import { normalizeRfidUid } from "./access-policy.js";
import { removePortrait } from "./portrait-storage.js";

function userData(input) {
  const rawRfidUid = String(input.rfidUid || "").trim();
  return {
    fullName: input.fullName,
    role: roleToDb[input.role],
    rfidUid: rawRfidUid && rawRfidUid.toUpperCase() !== "NOT LINKED" ? normalizeRfidUid(rawRfidUid) : null,
    avatarUrl: input.avatarUrl
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: { faceProfile: true },
    orderBy: { createdAt: "desc" }
  });
  return users.map(serializeUser);
}

export async function saveUser(input) {
  const data = userData(input);
  const user = await prisma.user.upsert({
    where: { id: input.id },
    create: { id: input.id, ...data, faceIdStatus: "PENDING" },
    update: data,
    include: { faceProfile: true }
  });
  return serializeUser(user);
}

export async function deleteUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { faceProfile: { select: { imagePath: true } } }
  });
  if (!user) return false;
  await prisma.user.delete({ where: { id } });
  await removePortrait(user.faceProfile?.imagePath);
  return true;
}
