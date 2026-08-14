import type { User } from "../types";

export interface BoardPayload {
  event?: string;
  status?: string;
  eventType?: "AUTH_SUCCESS" | "AUTH_FAILURE" | "AUTH_RETRY" | "AUTHENTICATION_ALERT" | "FORCED_LOCK_PRESENCE_ALERT" | "GATE_CLIMB_VIOLATION";
  alertType?: "REPEATED_AUTH_FAILURE" | "REPEATED_UNKNOWN_FACE" | "REPEATED_INVALID_RFID" | "PRESENCE_DETECTED_DURING_FORCED_LOCK" | "CLIMB_DETECTED_WHILE_GATE_CLOSED";
  authMethod?: "FACE" | "RFID" | "MIXED" | "NONE";
  failedAttempts?: number;
  decision?: "GRANTED" | "DENIED";
  gateState?: "OPEN" | "LOCKED";
  timestamp?: string;
  result?: string;
  gate?: string;
  led?: string;
  buzzer?: string;
  rfid_uid?: string;
  employee_id?: string;
  employee_name?: string;
  access_method?: "rfid" | "face";
  request_id?: string;
  distance_cm?: number;
  confidence?: number;
  reason?: string;
  passes?: number;
  authenticationAlerts?: number;
  view?: string;
  completedViews?: number;
  totalViews?: number;
}

interface BoardEventEnvelope {
  topic: string;
  payload: BoardPayload;
  receivedAt: string;
}

interface BoardEventHandlers {
  onBoardEvent: (event: BoardEventEnvelope) => void;
  onBrokerStatus: (connected: boolean) => void;
  onEnrollmentScan?: (scan: { rfidUid: string; receivedAt: string }) => void;
}

export function connectBoardEvents({
  onBoardEvent,
  onBrokerStatus,
  onEnrollmentScan,
}: BoardEventHandlers) {
  let eventSource: EventSource | null = null;
  let isClosed = false;
  let retryTimeout: number | undefined;

  const checkStatusFallback = async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as { mqttConnected?: boolean };
        onBrokerStatus(Boolean(data.mqttConnected));
      }
    } catch {
      // Ignored
    }
  };

  // Check immediately on mount
  void checkStatusFallback();
  const statusTimer = window.setInterval(() => {
    void checkStatusFallback();
  }, 5000);

  const initEventSource = () => {
    if (isClosed) return;
    eventSource = new EventSource("/api/events");

    eventSource.addEventListener("broker-status", (event) => {
      const status = JSON.parse((event as MessageEvent).data) as { connected?: boolean };
      onBrokerStatus(Boolean(status.connected));
    });

    eventSource.addEventListener("board-event", (event) => {
      const boardEvent = JSON.parse((event as MessageEvent).data) as BoardEventEnvelope;
      onBoardEvent(boardEvent);
    });

    eventSource.addEventListener("rfid-enrollment", (event) => {
      const scan = JSON.parse((event as MessageEvent).data) as {
        rfidUid: string;
        receivedAt: string;
      };
      onEnrollmentScan?.(scan);
    });

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      void checkStatusFallback();
      if (!isClosed) {
        retryTimeout = window.setTimeout(initEventSource, 3000);
      }
    };
  };

  initEventSource();

  return () => {
    isClosed = true;
    window.clearInterval(statusTimer);
    if (retryTimeout) window.clearTimeout(retryTimeout);
    if (eventSource) eventSource.close();
  };
}

export async function fetchUsersDatabase(): Promise<User[]> {
  const response = await fetch("/api/users", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `User fetch failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as { users?: User[] };
  if (!Array.isArray(body.users)) {
    throw new Error("User database response is invalid");
  }
  return body.users;
}

export async function syncUsersDatabase(users: User[]) {
  const response = await fetch("/api/users", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      users: users.map(({ id, fullName, email, role, rfidUid, faceIdStatus }) => ({
        id,
        fullName,
        email: email || "",
        role,
        rfidUid,
        faceIdStatus,
      })),
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `User sync failed with HTTP ${response.status}`);
  }
}

export async function startRfidEnrollment() {
  const response = await fetch("/api/enrollment/start", { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `RFID enrollment failed with HTTP ${response.status}`);
  }
}

export async function startFaceEnrollment(employeeId: string) {
  const response = await fetch("/api/face-enrollment/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Face enrollment failed with HTTP ${response.status}`);
  }
}

export async function sendGateOverride(action: "open" | "close" | "normal" | "buzzer_on" | "buzzer_off") {
  const response = await fetch("/api/gate/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Lệnh điều khiển cổng thất bại với HTTP ${response.status}`);
  }
}


