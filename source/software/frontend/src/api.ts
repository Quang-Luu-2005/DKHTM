import { AuditLog, HardwareState, User } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (!response.ok) throw new Error((await response.text()) || `API ${response.status}`);
  return response.status === 204 ? (undefined as T) : response.json();
}
export const api = {
  users: () => request<User[]>("/users"),
  saveUser: (user: User) => request<User>("/users", { method: "POST", body: JSON.stringify(user) }),
  deleteUser: (id: string) => request<void>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  logs: () => request<AuditLog[]>("/logs"),
  addLog: (log: Omit<AuditLog, "id" | "timestamp">) => request<AuditLog>("/logs", { method: "POST", body: JSON.stringify(log) }),
  hardware: () => request<HardwareState>("/hardware"),
  updateHardware: (state: HardwareState) => request<HardwareState>("/hardware", { method: "PUT", body: JSON.stringify(state) }),
  health: () => request<{ ok: boolean }>("/health")
};
