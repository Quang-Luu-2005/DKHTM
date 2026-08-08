import { User, AuditLog, HardwareState, AuthenticationAlert } from "./types";

export const INITIAL_USERS: User[] = [
  {
    id: "nv001",
    fullName: "Nguyễn Văn A",
    role: "General Staff",
    rfidUid: "NOT LINKED",
    faceIdStatus: "ENROLLED"
  },
  {
    id: "101",
    fullName: "Hoàng Nhân",
    role: "Security Officer",
    rfidUid: "NOT LINKED",
    faceIdStatus: "ENROLLED"
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: "log-1",
    timestamp: "2026-06-27 14:23:01",
    subjectName: "Marcus Thorne",
    accessMethod: "Face ID",
    gateId: "GT-NORTH-01",
    status: "ONLINE",
    confidence: "99.8%",
    avatarUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuB44dDLVxzIwQB3ldH3IdJWqsN8WIvoNOYNuMg_eBRusTfDQM9oty6BApZQVeW40S5N9E8rXMBII5tkiApOq4NPHD-kmLzf9B9GlfX0AKhmqdMe8Zwu1QEPHY9zNEOADyArazf5hXiSKWeOmEFmYLfGfV3YbHmcyRsIznlKBRbcoedv_2-1GUo3kTUrW9UeL4PELA8Bo5Qff_aM_rV-A78EG916pn4aEGnklrhuV1YrKXTmruDYe481SRoYfS5ApV9idLeuSf4qKX8"
  },
  {
    id: "log-2",
    timestamp: "2026-06-27 14:18:44",
    subjectName: "Unknown",
    accessMethod: "RFID",
    gateId: "GT-SOUTH-04",
    status: "AUTH_FAILURE",
    confidence: "N/A"
  },
  {
    id: "log-3",
    timestamp: "2026-06-27 14:15:12",
    subjectName: "Elena Vance",
    accessMethod: "Face ID",
    gateId: "LAB-SEC-09",
    status: "ONLINE",
    confidence: "98.2%",
    avatarUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuC5cJpziF_yMPkHP4VGuCwnKNJTWjEl2duYDQ27FuG0ZI_3MLGz556QvjjuHa4PmCn2c_bQyfvfNrhDrfMNFCH7t80jRVLLj0XYmcsRBaQ2tWgchiIiCtOp-xxnQFm27VP-H1NfjbxjRhAMhNsvfj4nFvnNR0n4N8TbjXs4qVcVAjlhFyBfeVijGTligO8BzzY5uj5cDzY3VXjZOuUi4bVYZ3J1dpSM1aYc7IwsV0HCWCcHy08VpGqNCx68hn6OlX_H9H8b7oIVSHU"
  },
  {
    id: "log-4",
    timestamp: "2026-06-27 14:02:33",
    subjectName: "Raj Patel",
    accessMethod: "RFID",
    gateId: "GT-NORTH-01",
    status: "ONLINE",
    confidence: "100%",
    avatarUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuAv8IEf8FQWyQNbakcMvWMn2Ycqw-5YiycRlRH45flN7xB5wiDhRd14PGAtNOjoSXxE7WQeI-Ct8w2hU5gG-1e6I26l9UhJZa5Qqa2nuQr06-z97HjbePMQoV3v4-ajDUyRV7OKWzcXgT-zw-zGF_G_xBLVC_acwQuo9wFnvRlGeB4twdUvv9J-44gk4f-ghg8gTYiDYYZLAuDJHKhh-LCNZgz6TOpVtTOoTaxgRT_9dN6K9gyheaI7WKzHBuV6eZEEyvNyoxdYGRI"
  },
  {
    id: "log-5",
    timestamp: "2026-06-27 13:55:10",
    subjectName: "Guest #882",
    accessMethod: "RFID",
    gateId: "GT-MAIN-00",
    status: "EXPIRED",
    confidence: "N/A"
  },
  {
    id: "log-6",
    timestamp: "2026-06-27 13:10:05",
    subjectName: "Sarah Chen",
    accessMethod: "Face ID",
    gateId: "LAB-SEC-09",
    status: "ONLINE",
    confidence: "99.1%"
  },
  {
    id: "log-7",
    timestamp: "2026-06-27 12:45:18",
    subjectName: "Jonathan Doe",
    accessMethod: "RFID",
    gateId: "GT-NORTH-01",
    status: "ONLINE",
    confidence: "100%"
  },
  {
    id: "log-8",
    timestamp: "2026-06-27 11:32:41",
    subjectName: "Unknown",
    accessMethod: "Face ID",
    gateId: "GT-MAIN-00",
    status: "AUTH_FAILURE",
    confidence: "N/A"
  }
];

export const INITIAL_HARDWARE: HardwareState = {
  servoArm: "SECURED / CLOSED",
  servoLocked: true,
  indicatorLed: "RED / RESTRICTED",
  systemBuzzer: "MUTED"
};

export const INITIAL_AUTHENTICATION_ALERT: AuthenticationAlert = {
  id: "AUTH-ALERT-DEMO",
  timestamp: "14:28:45",
  gateId: "ESP32_SEC_01",
  alertType: "REPEATED_UNKNOWN_FACE",
  authMethod: "FACE",
  failedAttempts: 3,
  decision: "DENIED",
  gateState: "LOCKED",
  captureImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuA1-U-sOKlVXo3ex17StlU2Z4m1fVHX66Fvwho1CR515JP6SQ0SawYOTugf5fuVrj6TMOgIPMh5wrqZIQw_SSEq8QBepOibM4pAbPMA6iNfZw6MR2rzhWFUq_H0YeFsZFCVa5Q4U4vBQ9NMCgwnmVQhmspHltenF2teCete7C1-piRveTdU64xBEgcs8YopnOz8KtH5Yc4iHU89VqdIyWzGbyv_m3XtVqYwKXq_CgPmRZ5ICJvhxuVRDopo6HxnSVgBRXZ2mm5Hyho"
};

// LocalStorage helpers
export function getUsers(): User[] {
  const stored = localStorage.getItem("sentinel_users");
  if (!stored) {
    localStorage.setItem("sentinel_users", JSON.stringify(INITIAL_USERS));
    return INITIAL_USERS;
  }
  try {
    const existing = JSON.parse(stored) as User[];
    // Filter out old SENT demo users and keep only real ones (or initial ones)
    const cleaned = existing.filter((u) => !u.id.startsWith("SENT-"));
    const missing = INITIAL_USERS.filter((initUser) => !cleaned.some((u) => u.id === initUser.id));
    const merged = [...cleaned, ...missing];
    localStorage.setItem("sentinel_users", JSON.stringify(merged));
    return merged;
  } catch {
    localStorage.setItem("sentinel_users", JSON.stringify(INITIAL_USERS));
    return INITIAL_USERS;
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
    localStorage.setItem("sentinel_logs", JSON.stringify(INITIAL_AUDIT_LOGS));
    return INITIAL_AUDIT_LOGS;
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
  return JSON.parse(hw);
}

export function saveHardwareState(state: HardwareState) {
  localStorage.setItem("sentinel_hardware", JSON.stringify(state));
}
