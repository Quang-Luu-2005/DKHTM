import type { User } from "../types";

export type BoardAction =
  | "open"
  | "close"
  | "normal"
  | "led_green"
  | "led_red"
  | "buzzer_on"
  | "buzzer_off"
  | "reset_violation";

export interface BoardPayload {
  event?: string;
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
  violators?: number;
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

export async function sendBoardCommand(action: BoardAction) {
  const response = await fetch("/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Command failed with HTTP ${response.status}`);
  }
}

export async function syncUsersDatabase(users: User[]) {
  const response = await fetch("/api/users", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      users: users.map(({ id, fullName, email, role, rfidUid }) => ({
        id,
        fullName,
        email: email || "",
        role,
        rfidUid,
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

export async function reportViolationNotification(gateId: string, details: string) {
  const response = await fetch("/api/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gateId, details }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Incident notification failed with HTTP ${response.status}`);
  }
}

export async function sendFaceRecognitionResult(result: {
  requestId: string;
  authorized: boolean;
  employeeId?: string;
  employeeName?: string;
  confidence: number;
  reason: string;
}) {
  const response = await fetch("/api/face-results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Face result failed with HTTP ${response.status}`);
  }
}
