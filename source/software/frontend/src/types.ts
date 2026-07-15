/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  fullName: string;
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
  accessMethod: "Face ID" | "RFID" | "Manual Override" | "Gate Jumping / Climbing detected" | "Tailgating detected";
  gateId: string;
  status: "ONLINE" | "VIOLATION" | "EXPIRED";
  confidence: string; // "99.8%" or "N/A"
  avatarUrl?: string;
}

export interface HardwareState {
  servoArm: "SECURED / CLOSED" | "OPENED / UNSECURED";
  servoLocked: boolean;
  indicatorLed: "RED / RESTRICTED" | "GREEN / ACCESS ALLOWED";
  systemBuzzer: "MUTED" | "ACTIVE";
}

export interface SecurityIncident {
  id: string;
  timestamp: string;
  gateId: string;
  violationDetails: string;
  servoLocked: boolean;
  buzzerActive: boolean;
  policeNotified: "PENDING" | "NOTIFIED" | "RESOLVED";
  captureImageUrl: string;
}
