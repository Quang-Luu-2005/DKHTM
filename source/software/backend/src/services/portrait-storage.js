import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export function portraitDirectory() {
  return path.resolve(config.UPLOAD_DIR, "portraits");
}

export async function writePortrait(payload) {
  const directory = portraitDirectory();
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${Date.now()}-${randomUUID()}.jpg`);
  await fs.writeFile(filePath, payload, { flag: "wx" });
  return filePath;
}

export async function removePortrait(filePath) {
  if (!filePath) return;
  const directory = portraitDirectory();
  const resolved = path.resolve(filePath);
  const relative = path.relative(directory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    console.error(`Refusing to remove portrait outside managed directory: ${resolved}`);
    return;
  }
  await fs.unlink(resolved).catch(error => {
    if (error?.code !== "ENOENT") console.error(`Failed to remove portrait ${resolved}`, error);
  });
}
