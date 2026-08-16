import { User, AuditLog, HardwareState, AuthenticationAlert } from "./types";

export const INITIAL_USERS: User[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const INITIAL_HARDWARE: HardwareState = {
  servoArm: "SECURED / CLOSED",
  servoLocked: true,
  indicatorLed: "RED / RESTRICTED",
  systemBuzzer: "MUTED",
  authenticationSessionActive: false,
};

export const INITIAL_AUTHENTICATION_ALERT: AuthenticationAlert | null = null;

// LocalStorage helpers
export function getUsers(): User[] {
  try {
    const stored = localStorage.getItem("sentinel_users");
    if (!stored) return [];
    const existing = JSON.parse(stored) as User[];
    return Array.isArray(existing) ? existing : [];
  } catch {
    return [];
  }
}

export function saveUser(user: User): User[] {
  const users = getUsers();
  const existingIndex = users.findIndex(u => u.id === user.id);
  if (existingIndex > -1) {
    users[existingIndex] = user;
  } else {
    users.unshift(user);
  }
  localStorage.setItem("sentinel_users", JSON.stringify(users));
  return users;
}

export function replaceUsers(users: User[]): User[] {
  localStorage.setItem("sentinel_users", JSON.stringify(users));
  return users;
}

export function deleteUser(id: string): User[] {
  const users = getUsers();
  const filtered = users.filter(u => u.id !== id);
  localStorage.setItem("sentinel_users", JSON.stringify(filtered));
  return filtered;
}

export function getAuditLogs(): AuditLog[] {
  const logs = localStorage.getItem("sentinel_logs");
  if (!logs) {
    localStorage.setItem("sentinel_logs", JSON.stringify([]));
    return [];
  }
  const stored = JSON.parse(logs) as Array<AuditLog & { status: string; accessMethod: string }>;
  const validStatuses = new Set(["ONLINE", "AUTH_FAILURE", "AUTH_ALERT", "EXPIRED"]);
  return stored.map((log) => ({
    ...log,
    status: validStatuses.has(log.status) ? log.status : "AUTH_FAILURE",
    accessMethod:
      log.accessMethod === "Face ID" || log.accessMethod === "RFID" || log.accessMethod === "Manual Override"
        ? log.accessMethod
        : "Face ID",
  })) as AuditLog[];
}

export function addAuditLog(log: Omit<AuditLog, "id" | "timestamp">): AuditLog[] {
  const logs = getAuditLogs();
  const now = new Date();
  const formatNum = (n: number) => n.toString().padStart(2, "0");
  const timestampStr = `${now.getFullYear()}-${formatNum(now.getMonth() + 1)}-${formatNum(now.getDate())} ${formatNum(now.getHours())}:${formatNum(now.getMinutes())}:${formatNum(now.getSeconds())}`;

  const newLog: AuditLog = {
    ...log,
    id: `log-${Date.now()}`,
    timestamp: timestampStr
  };

  logs.unshift(newLog);
  localStorage.setItem("sentinel_logs", JSON.stringify(logs));
  return logs;
}

export function saveAuditLogs(logs: AuditLog[]): AuditLog[] {
  localStorage.setItem("sentinel_logs", JSON.stringify(logs));
  return logs;
}

export function getHardwareState(): HardwareState {
  const hw = localStorage.getItem("sentinel_hardware");
  if (!hw) {
    localStorage.setItem("sentinel_hardware", JSON.stringify(INITIAL_HARDWARE));
    return INITIAL_HARDWARE;
  }
  return { ...INITIAL_HARDWARE, ...JSON.parse(hw) };
}

export function saveHardwareState(state: HardwareState) {
  localStorage.setItem("sentinel_hardware", JSON.stringify(state));
}
