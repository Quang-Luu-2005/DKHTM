import type { User } from "../types";

export interface BoardPayload {
  event?: string;
  status?: string;
  eventType?: "AUTH_SUCCESS" | "AUTH_FAILURE" | "AUTH_RETRY" | "AUTHENTICATION_ALERT" | "FORCED_LOCK_PRESENCE_ALERT";
  alertType?: "REPEATED_AUTH_FAILURE" | "REPEATED_UNKNOWN_FACE" | "REPEATED_INVALID_RFID" | "PRESENCE_DETECTED_DURING_FORCED_LOCK";
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
  const eventSource = new EventSource("/api/events");

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

  eventSource.onerror = () => onBrokerStatus(false);

  return () => eventSource.close();
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
