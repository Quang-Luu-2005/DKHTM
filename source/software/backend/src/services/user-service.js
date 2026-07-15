import { prisma } from "../prisma.js";
import { roleToDb, serializeUser } from "../domain.js";

function userData(input) {
  return {
    fullName: input.fullName,
    role: roleToDb[input.role],
    rfidUid: input.rfidUid,
    faceIdStatus: input.faceIdStatus,
    avatarUrl: input.avatarUrl
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return users.map(serializeUser);
}

export async function saveUser(input) {
  const data = userData(input);
  const user = await prisma.user.upsert({ where: { id: input.id }, create: { id: input.id, ...data }, update: data });
  return serializeUser(user);
}

export async function deleteUser(id) {
  const result = await prisma.user.deleteMany({ where: { id } });
  return result.count > 0;
}
