import { AuditLog, HardwareDirectCommand, HardwareState, SseEnvelope, User } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  if (!response.ok) {
    const raw = await response.text();
    let message = raw || `API ${response.status}`;
    try {
      const payload = JSON.parse(raw) as { error?: string; message?: string };
      message = payload.message || payload.error || message;
    } catch {
      // Keep the plain-text response when the server did not return JSON.
    }
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const api = {
  users: () => request<User[]>("/users"),
  saveUser: (user: User) => request<User>("/users", { method: "POST", body: JSON.stringify(user) }),
  enrollUser: (formData: FormData) => request<User>("/users/enroll", { method: "POST", body: formData }),
  deleteUser: (id: string) => request<void>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  logs: () => request<AuditLog[]>("/logs"),
  addLog: (log: Omit<AuditLog, "id" | "timestamp">) => request<AuditLog>("/logs", { method: "POST", body: JSON.stringify(log) }),
  hardware: () => request<HardwareState>("/hardware"),
  updateHardware: (state: HardwareState) => request<HardwareState>("/hardware", {
    method: "PUT",
    body: JSON.stringify({
      servoArm: state.servoArm,
      servoLocked: state.servoLocked,
      indicatorLed: state.indicatorLed,
      systemBuzzer: state.systemBuzzer
    })
  }),
  commandHardware: (command: HardwareDirectCommand) => request<{ ok: true; hardware: HardwareState }>("/hardware/command", {
    method: "POST",
    body: JSON.stringify({ command })
  }),
  health: () => request<{
    ok: boolean;
    faceMatchThreshold: number;
    facePresenceWindowMs: number;
  }>("/health"),
  subscribe: (handlers: {
    onOpen?: () => void;
    onError?: () => void;
    onAuditLog?: (event: SseEnvelope<AuditLog>) => void;
    onHardwareState?: (event: SseEnvelope<HardwareState>) => void;
  }) => {
    const source = new EventSource(`${API_BASE}/api/events`);
    source.onopen = () => handlers.onOpen?.();
    source.onerror = () => handlers.onError?.();
    source.addEventListener("audit.log", event => handlers.onAuditLog?.(JSON.parse((event as MessageEvent).data)));
    source.addEventListener("hardware.state", event => handlers.onHardwareState?.(JSON.parse((event as MessageEvent).data)));
    return () => source.close();
  }
};
