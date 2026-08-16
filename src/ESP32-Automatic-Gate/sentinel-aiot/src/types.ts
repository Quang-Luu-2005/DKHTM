/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  fullName: string;
  email?: string;
  role: "Administrator" | "Security Officer" | "Technician" | "General Staff";
  rfidUid: string; // "NOT LINKED" or a hex sequence like "E2:00:15:B4:77"
  faceIdStatus: "ENROLLED" | "PENDING";
  avatarUrl?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  subjectName: string;
  subjectId?: string;
  accessMethod: "Face ID" | "RFID" | "Manual Override" | "HC-SR04";
  gateId: string;
  status: "ONLINE" | "AUTH_FAILURE" | "AUTH_ALERT" | "EXPIRED";
  confidence: string; // "99.8%" or "N/A"
  executionTime?: string; // "1.2s" or "350ms"
  avatarUrl?: string;
}

export interface HardwareState {
  servoArm: "SECURED / CLOSED" | "OPENED / UNSECURED";
  servoLocked: boolean;
  indicatorLed: "RED / RESTRICTED" | "GREEN / ACCESS ALLOWED";
  systemBuzzer: "MUTED" | "ACTIVE";
  authenticationSessionActive: boolean;
}

export interface AuthenticationAlert {
  id: string;
  timestamp: string;
  gateId: string;
  alertType: "REPEATED_AUTH_FAILURE" | "REPEATED_UNKNOWN_FACE" | "REPEATED_INVALID_RFID" | "PRESENCE_DETECTED_DURING_FORCED_LOCK" | "CLIMB_DETECTED_WHILE_GATE_CLOSED";
  authMethod: "FACE" | "RFID" | "MIXED" | "NONE";
  failedAttempts: number;
  decision: "DENIED";
  gateState: "LOCKED";
  captureImageUrl?: string;
}
