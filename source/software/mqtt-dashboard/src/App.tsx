/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  getUsers,
  saveUser,
  deleteUser,
  getAuditLogs,
  addAuditLog,
  getHardwareState,
  saveHardwareState,
  INITIAL_INCIDENT
} from "./data";
import { User, AuditLog, HardwareState, SecurityIncident } from "./types";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import IncidentModal from "./components/IncidentModal";
import DashboardView from "./components/DashboardView";
import PersistentCameraWidget from "./components/PersistentCameraWidget";
import RegistrationView from "./components/RegistrationView";
import LogsView from "./components/LogsView";
import {
  connectBoardEvents,
  reportViolationNotification,
  sendBoardCommand,
  sendFaceRecognitionResult,
  startRfidEnrollment,
  syncUsersDatabase,
  type BoardAction,
} from "./services/boardApi";
import {
  detectClearFaceInCurrentCameraFrame,
  recognizeCurrentCameraFace,
} from "./services/faceRecognition";
import {
  ShieldAlert,
  HeartHandshake,
  Wrench,
  Database,
  Terminal,
  Cpu,
  LayoutDashboard,
  UserPlus,
  History,
  Settings,
  CheckCircle2
} from "lucide-react";

export default function App() {
  // Navigation State
  const [currentTab, setCurrentTab] = useState("dashboard");

  // Theme State
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("sentinel_theme");
    return (saved === "light" || saved === "dark") ? saved : "dark";
  });

  useEffect(() => {
    localStorage.setItem("sentinel_theme", theme);
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  // Domain states
  const [users, setUsers] = useState<User[]>([]);
  const [usersInitialized, setUsersInitialized] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [hardware, setHardware] = useState<HardwareState>({
    servoArm: "SECURED / CLOSED",
    servoLocked: true,
    indicatorLed: "RED / RESTRICTED",
    systemBuzzer: "MUTED"
  });
  const [mqttConnected, setMqttConnected] = useState(false);
  const [latestRfidEnrollment, setLatestRfidEnrollment] = useState<{
    rfidUid: string;
    receivedAt: string;
  } | null>(null);
  const usersRef = useRef<User[]>([]);
  const faceScanInProgressRef = useRef(false);
  const facePresencePollInProgressRef = useRef(false);
  const facePresenceStartedAtRef = useRef<number | null>(null);
  const faceAbsentStartedAtRef = useRef<number | null>(null);
  const facePresenceArmedRef = useRef(true);
  const [faceScanState, setFaceScanState] = useState<
    "idle" | "loading" | "scanning" | "granted" | "denied" | "error"
  >("idle");
  const [faceScanMessage, setFaceScanMessage] = useState("Đưa khuôn mặt rõ vào khung hình");

  // Emergency lockdown trigger state
  const [isEmergencyLocked, setIsEmergencyLocked] = useState(false);

  // Automated Security Behavior state
  const [isAutomatedLockActive, setIsAutomatedLockActive] = useState(false);

  // Biometric Threat Modal state
  const [isViolationOpen, setIsViolationOpen] = useState(false);
  const [activeIncident, setActiveIncident] = useState<SecurityIncident>(INITIAL_INCIDENT);

  // Support & Settings customized form states
  const [supportMessage, setSupportMessage] = useState("");
  const [isSupportSubmitted, setIsSupportSubmitted] = useState(false);
  const [facialThreshold, setFacialThreshold] = useState(98.5);

  // Automated Security Behavior Listener
  useEffect(() => {
    if (logs.length === 0) return;
    const latestLog = logs[0];

    const isJumpingOrClimbing =
      (latestLog.subjectName || "").toLowerCase().includes("jumping") ||
      (latestLog.subjectName || "").toLowerCase().includes("climbing") ||
      (latestLog.accessMethod || "").toLowerCase().includes("jumping") ||
      (latestLog.accessMethod || "").toLowerCase().includes("climbing");

    const isTailgating =
      (latestLog.subjectName || "").toLowerCase().includes("tailgating") ||
      (latestLog.accessMethod || "").toLowerCase().includes("tailgating");

    if (latestLog.status === "VIOLATION" && (isJumpingOrClimbing || isTailgating)) {
      // Trigger the automated macro instantly
      setIsEmergencyLocked(true);
      setIsAutomatedLockActive(true);

      // Force instant lockdown hardware state
      const automatedLockdownState: HardwareState = {
        servoArm: "SECURED / CLOSED",
        servoLocked: true,
        indicatorLed: "RED / RESTRICTED",
        systemBuzzer: "ACTIVE"
      };
      setHardware(automatedLockdownState);
      saveHardwareState(automatedLockdownState);
    }
  }, [logs]);

  // Initialize data on mount
  useEffect(() => {
    setUsers(getUsers());
    setUsersInitialized(true);
    setLogs(getAuditLogs());
    setHardware(getHardwareState());
  }, []);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const processFaceScanRequest = async (requestId: string) => {
    if (faceScanInProgressRef.current) return;
    faceScanInProgressRef.current = true;
    setFaceScanState("loading");
    setFaceScanMessage("Đang tải mô hình và lấy ảnh từ ESP32-CAM...");

    try {
      setFaceScanState("scanning");
      const recognition = await recognizeCurrentCameraFace(usersRef.current);
      await sendFaceRecognitionResult({ requestId, ...recognition });

      if (recognition.authorized) {
        setFaceScanState("granted");
        setFaceScanMessage(
          `${recognition.employeeName} • độ tương đồng ${recognition.confidence}%`,
        );
      } else {
        setFaceScanState("denied");
        const messages: Record<string, string> = {
          no_face_detected: "Không thấy khuôn mặt rõ ràng — sẽ quét lại",
          no_face_database: "Database chưa có ảnh khuôn mặt hợp lệ",
          face_not_matched: `Khuôn mặt không khớp • ${recognition.confidence}%`,
        };
        setFaceScanMessage(messages[recognition.reason] || "Khuôn mặt không hợp lệ");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không nhận diện được khuôn mặt";
      setFaceScanState("error");
      setFaceScanMessage(message);
      try {
        await sendFaceRecognitionResult({
          requestId,
          authorized: false,
          confidence: 0,
          reason: "camera_or_model_error",
        });
      } catch (sendError) {
        console.error("Không trả được lỗi nhận diện về ESP32:", sendError);
      }
    } finally {
      faceScanInProgressRef.current = false;
    }
  };

  // The camera initiates recognition only after one clear face remains visible
  // continuously for two seconds. A new scan is armed after the face leaves.
  useEffect(() => {
    const FACE_HOLD_DURATION_MS = 2000;
    const FACE_REARM_ABSENCE_MS = 1500;
    const FACE_PRESENCE_POLL_MS = 500;
    let disposed = false;

    const pollFacePresence = async () => {
      if (disposed || facePresencePollInProgressRef.current || faceScanInProgressRef.current) return;
      facePresencePollInProgressRef.current = true;

      try {
        const hasClearFace = await detectClearFaceInCurrentCameraFrame();
        if (disposed) return;
        const now = Date.now();

        if (!hasClearFace) {
          facePresenceStartedAtRef.current = null;
          if (!facePresenceArmedRef.current) {
            faceAbsentStartedAtRef.current ??= now;
            if (now - faceAbsentStartedAtRef.current >= FACE_REARM_ABSENCE_MS) {
              facePresenceArmedRef.current = true;
              faceAbsentStartedAtRef.current = null;
              setFaceScanState("idle");
              setFaceScanMessage("Đưa khuôn mặt rõ vào khung hình");
            }
          } else {
            setFaceScanState("idle");
            setFaceScanMessage("Đưa khuôn mặt rõ vào khung hình");
          }
          return;
        }

        faceAbsentStartedAtRef.current = null;
        if (!facePresenceArmedRef.current) return;

        facePresenceStartedAtRef.current ??= now;
        const visibleDuration = now - facePresenceStartedAtRef.current;
        if (visibleDuration < FACE_HOLD_DURATION_MS) {
          const secondsRemaining = Math.max(1, Math.ceil((FACE_HOLD_DURATION_MS - visibleDuration) / 1000));
          setFaceScanState("scanning");
          setFaceScanMessage(`Giữ khuôn mặt rõ thêm ${secondsRemaining} giây`);
          return;
        }

        facePresenceArmedRef.current = false;
        facePresenceStartedAtRef.current = null;
        const requestId = `cam-${now.toString(36)}`;
        await processFaceScanRequest(requestId);
      } catch (error) {
        if (disposed) return;
        facePresenceStartedAtRef.current = null;
        const message = error instanceof Error ? error.message : "Không đọc được camera";
        setFaceScanState("error");
        setFaceScanMessage(message);
      } finally {
        facePresencePollInProgressRef.current = false;
      }
    };

    void pollFacePresence();
    const interval = window.setInterval(() => void pollFacePresence(), FACE_PRESENCE_POLL_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  // Keep the server-side RFID authorization database synchronized with the UI.
  useEffect(() => {
    if (!usersInitialized) return;
    void syncUsersDatabase(users).catch((error) => {
      console.error("Không thể đồng bộ cơ sở dữ liệu nhân viên:", error);
    });
  }, [users, usersInitialized, mqttConnected]);

  // Receive real hardware telemetry from the local MQTT bridge.
  useEffect(() => {
    return connectBoardEvents({
      onBrokerStatus: setMqttConnected,
      onEnrollmentScan: setLatestRfidEnrollment,
      onBoardEvent: ({ payload }) => {
        const result = payload.result?.toLowerCase();

        setHardware((current) => {
          const next = { ...current };
          const gate = payload.gate?.toLowerCase();
          const led = payload.led?.toLowerCase();
          const buzzer = payload.buzzer?.toLowerCase();

          if (gate === "open" || result === "granted" || result === "opened") {
            next.servoArm = "OPENED / UNSECURED";
            next.servoLocked = false;
          } else if (gate === "closed" || result === "closed" || result === "violated") {
            next.servoArm = "SECURED / CLOSED";
            next.servoLocked = true;
          }

          if (led === "green" || result === "led_green" || result === "granted") {
            next.indicatorLed = "GREEN / ACCESS ALLOWED";
          } else if (led === "red" || result === "led_red" || result === "violated") {
            next.indicatorLed = "RED / RESTRICTED";
          }

          if (buzzer === "active" || result === "buzzer_active" || result === "violated") {
            next.systemBuzzer = "ACTIVE";
          } else if (buzzer === "muted" || result === "buzzer_muted") {
            next.systemBuzzer = "MUTED";
          }

          saveHardwareState(next);
          return next;
        });

        if (result === "granted") {
          const isFaceAccess = payload.access_method === "face";
          const rfidUid = payload.rfid_uid || "Không xác định";
          setLogs(addAuditLog({
            subjectName: payload.employee_name || (isFaceAccess ? "Nhân viên nhận diện khuôn mặt" : `RFID ${rfidUid}`),
            subjectId: payload.employee_id || (isFaceAccess ? undefined : rfidUid),
            accessMethod: isFaceAccess ? "Face ID" : "RFID",
            gateId: "GT-NORTH-01",
            status: "ONLINE",
            confidence: payload.confidence !== undefined ? `${payload.confidence}%` : "100%",
          }));
        } else if (result === "denied") {
          const isFaceAccess = payload.access_method === "face";
          const rfidUid = payload.rfid_uid || "Không xác định";
          setLogs(addAuditLog({
            subjectName: isFaceAccess ? "Khuôn mặt không khớp database" : `Thẻ không hợp lệ (${rfidUid})`,
            subjectId: isFaceAccess ? undefined : rfidUid,
            accessMethod: isFaceAccess ? "Face ID" : "RFID",
            gateId: "GT-NORTH-01",
            status: "VIOLATION",
            confidence: "N/A",
          }));
        } else if (result === "violated") {
          setLogs(addAuditLog({
            subjectName: "Phát hiện vi phạm tại cổng",
            accessMethod: "Gate Jumping / Climbing detected",
            gateId: "GT-NORTH-01",
            status: "VIOLATION",
            confidence: "N/A",
          }));
          setIsViolationOpen(true);
          setIsEmergencyLocked(true);
          setIsAutomatedLockActive(true);
        } else if (result === "opened" || result === "normal") {
          setIsViolationOpen(false);
          setIsEmergencyLocked(false);
          setIsAutomatedLockActive(false);
        }
      },
    });
  }, []);

  // Handle saving new user
  const handleSaveUser = (user: User) => {
    const normalizedUid = user.rfidUid.trim().toUpperCase();
    const duplicate = users.find(
      (existingUser) =>
        existingUser.id !== user.id &&
        normalizedUid !== "NOT LINKED" &&
        existingUser.rfidUid.trim().toUpperCase() === normalizedUid,
    );
    if (duplicate) {
      alert(`Thẻ này đã được liên kết với ${duplicate.fullName}.`);
      return;
    }

    const updatedUsers = saveUser(user);
    setUsers(updatedUsers);

    // Automatically log this as an enrollment action
    const updatedLogs = addAuditLog({
      subjectName: user.fullName,
      accessMethod: "Face ID",
      gateId: "GT-NORTH-01",
      status: "ONLINE",
      confidence: "100%"
    });
    setLogs(updatedLogs);
  };

  // Handle deleting a user
  const handleDeleteUser = (id: string) => {
    const updatedUsers = deleteUser(id);
    setUsers(updatedUsers);
  };

  // Callback to insert manual logs
  const handleAddLog = (log: Omit<AuditLog, "id" | "timestamp">) => {
    const updatedLogs = addAuditLog(log);
    setLogs(updatedLogs);
  };

  // Synchronize hardware changes
  const handleUpdateHardware = (hw: HardwareState) => {
    setHardware(hw);
    saveHardwareState(hw);
  };

  const handleBoardCommand = async (action: BoardAction) => {
    await sendBoardCommand(action);
    if (action === "open" || action === "normal") {
      setIsViolationOpen(false);
      setIsEmergencyLocked(false);
      setIsAutomatedLockActive(false);
    }
  };

  const handleStartRfidEnrollment = async () => {
    setLatestRfidEnrollment(null);
    await startRfidEnrollment();
  };

  // Trigger Emergency system lockdown
  const handleToggleEmergencyLock = () => {
    const nextLocked = !isEmergencyLocked;
    setIsEmergencyLocked(nextLocked);

    if (!nextLocked) {
      setIsAutomatedLockActive(false);
    }

    if (nextLocked) {
      void handleBoardCommand("close").catch(console.error);
      // Set hardware to lockdown state
      const lockedState: HardwareState = {
        servoArm: "SECURED / CLOSED",
        servoLocked: true,
        indicatorLed: "RED / RESTRICTED",
        systemBuzzer: "ACTIVE"
      };
      handleUpdateHardware(lockedState);

      // Add audit log entry
      const updatedLogs = addAuditLog({
        subjectName: "Emergency Override",
        accessMethod: "Manual Override",
        gateId: "SYS-CORE-01",
        status: "VIOLATION",
        confidence: "N/A"
      });
      setLogs(updatedLogs);
    } else {
      void handleBoardCommand("normal").catch(console.error);
      // Release hardware
      const normalState: HardwareState = {
        servoArm: "SECURED / CLOSED",
        servoLocked: true,
        indicatorLed: "RED / RESTRICTED",
        systemBuzzer: "MUTED"
      };
      handleUpdateHardware(normalState);

      const updatedLogs = addAuditLog({
        subjectName: "Lock Release",
        accessMethod: "Manual Override",
        gateId: "SYS-CORE-01",
        status: "ONLINE",
        confidence: "N/A"
      });
      setLogs(updatedLogs);
    }
  };

  // Simulate intruder event with customizable threat scenario
  const handleSimulateViolation = (type?: "FACE_MISMATCH" | "GATE_JUMPING" | "TAILGATING") => {
    // Generate an incident structure
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    let id = "EVT_ID: #404-ERR";
    let violationDetails = "A face recognition mismatch occurred at primary gate Node ESP32_SEC_01. The neural model failed to correlate the scanned biometrics with any verified account index. Silent alarm buzzer triggered.";
    let subjectName = "Intruder Detected";
    let accessMethod: "Face ID" | "RFID" | "Manual Override" | "Gate Jumping / Climbing detected" | "Tailgating detected" = "Face ID";

    if (type === "GATE_JUMPING") {
      id = "EVT_ID: #JUMP-911";
      subjectName = "Intruder: Gate Jumping";
      accessMethod = "Gate Jumping / Climbing detected";
      violationDetails = "CRITICAL METRIC: LiDAR / Microwave perimeter beam disruption detected at primary North Gate Node. Dynamic spatial model confirms a subject scaled and jumped physical fence barrier. System automatic containment triggered.";
    } else if (type === "TAILGATING") {
      id = "EVT_ID: #TAIL-402";
      subjectName = "Intruder: Tailgating";
      accessMethod = "Tailgating detected";
      violationDetails = "CRITICAL METRIC: High-dimensional stereoscopic density scanning reports a tailgating anomaly behind Marcus Thorne at Gate 01. Multiple physical silhouettes detected on single token scan. System automatic containment triggered.";
    }

    const simulatedIncident: SecurityIncident = {
      id: id,
      timestamp: timeStr,
      gateId: "GT-SOUTH-04",
      violationDetails: violationDetails,
      servoLocked: true,
      buzzerActive: true,
      policeNotified: "PENDING",
      captureImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuA1-U-sOKlVXo3ex17StlU2Z4m1fVHX66Fvwho1CR515JP6SQ0SawYOTugf5fuVrj6TMOgIPMh5wrqZIQw_SSEq8QBepOibM4pAbPMA6iNfZw6MR2rzhWFUq_H0YeFsZFCVa5Q4U4vBQ9NMCgwnmVQhmspHltenF2teCete7C1-piRveTdU64xBEgcs8YopnOz8KtH5Yc4iHU89VqdIyWzGbyv_m3XtVqYwKXq_CgPmRZ5ICJvhxuVRDopo6HxnSVgBRXZ2mm5Hyho"
    };

    setActiveIncident(simulatedIncident);
    setIsViolationOpen(true);
    void reportViolationNotification(simulatedIncident.gateId, simulatedIncident.violationDetails)
      .catch((error) => console.error("Không thể gửi email cảnh báo:", error));

    // Set hardware indicators to high-alarm lockdown
    handleUpdateHardware({
      servoArm: "SECURED / CLOSED",
      servoLocked: true,
      indicatorLed: "RED / RESTRICTED",
      systemBuzzer: "ACTIVE"
    });

    // Write a violation directly to logs
    const updatedLogs = addAuditLog({
      subjectName: subjectName,
      accessMethod: accessMethod,
      gateId: "GT-NORTH-01",
      status: "VIOLATION",
      confidence: "N/A"
    });
    setLogs(updatedLogs);
  };

  // Dismiss threat modal
  const handleCloseViolation = () => {
    setIsViolationOpen(false);
  };

  // Handle support ticket submission
  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;
    setIsSupportSubmitted(true);
    setTimeout(() => {
      setSupportMessage("");
    }, 4000);
  };

  return (
    <div className={`min-h-screen bg-brand-bg text-brand-dark-text font-sans antialiased pb-16 lg:pb-0 selection:bg-brand-accent selection:text-brand-surface transition-colors duration-300 ${theme}`}>

      {/* Top Navigation Bar */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onSimulateViolation={handleSimulateViolation}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Container Wrapper */}
      <div className="flex pt-16">

        {/* Sidebar administrative navigation rail (Hidden on mobile) */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          isEmergencyLocked={isEmergencyLocked}
          onToggleEmergencyLock={handleToggleEmergencyLock}
          isAutomatedLockActive={isAutomatedLockActive}
        />

        {/* Primary View Area (padded for top bar and left side sidebar) */}
        <main className="flex-1 lg:ml-64 p-6 lg:p-8 min-h-[calc(100vh-4rem)]">

          {/* Persistent Automated System Lock Banner */}
          {isAutomatedLockActive ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 bg-red-600 border border-red-500 text-white p-5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_0_20px_rgba(220,38,38,0.3)] animate-pulse"
            >
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 bg-white rounded-full animate-ping shrink-0" />
                <span className="font-mono text-xs font-bold tracking-widest uppercase">
                  AUTOMATED SYSTEM LOCK ENGAGED - Intruder Detected Jumping Physical Gate
                </span>
              </div>
              <button
                onClick={handleToggleEmergencyLock}
                className="px-3.5 py-1.5 bg-white text-red-600 rounded-lg font-sans text-[10px] font-bold uppercase tracking-wider hover:bg-red-50 active:scale-95 transition-all shadow-md cursor-pointer shrink-0"
              >
                Reset System
              </button>
            </motion.div>
          ) : isEmergencyLocked ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-rose-500/10 border border-rose-500/50 p-4 rounded-xl flex items-center gap-3 text-rose-400 font-mono text-xs"
            >
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping shrink-0" />
              <strong className="uppercase">SYSTEM QUARANTINE MODALITY ACTIVE</strong>
              <span>— All access nodes are physically isolated. Manual and biometric overrides are restricted.</span>
            </motion.div>
          ) : null}

          <div className="max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
              >
                {/* Switch tab routes */}
                {currentTab === "dashboard" && (
                  <DashboardView
                    hardware={hardware}
                    onUpdateHardware={handleUpdateHardware}
                    onCommand={handleBoardCommand}
                    mqttConnected={mqttConnected}
                    logs={logs}
                    onAddLog={handleAddLog}
                    isEmergencyLocked={isEmergencyLocked}
                    faceScanState={faceScanState}
                    faceScanMessage={faceScanMessage}
                  />
                )}

                {currentTab === "registration" && (
                  <RegistrationView
                    users={users}
                    onSaveUser={handleSaveUser}
                    onDeleteUser={handleDeleteUser}
                    latestRfidScan={latestRfidEnrollment}
                    onStartRfidScan={handleStartRfidEnrollment}
                  />
                )}

                {currentTab === "logs" && (
                  <LogsView logs={logs} />
                )}

                {currentTab === "support" && (
                  <div className="max-w-2xl mx-auto bg-[#111113] border border-[#1E293B] rounded-2xl p-6 lg:p-8 shadow-xl mt-6">
                    <div className="flex items-center gap-3.5 mb-6">
                      <HeartHandshake className="w-5 h-5 text-[#94A3B8]" />
                      <h2 className="font-serif text-lg font-light text-[#F8FAFC] tracking-wider">
                        Support Console
                      </h2>
                    </div>

                    <p className="text-xs text-[#94A3B8] leading-relaxed mb-6 font-sans">
                      Submit administrative inquiries or query hardware system configuration tickets directly to the Sentinel support engineering crew.
                    </p>

                    {isSupportSubmitted ? (
                      <div className="bg-[#161618] border border-[#334155] rounded-xl p-6 text-center">
                        <CheckCircle2 className="w-6 h-6 text-[#94A3B8] mx-auto mb-3" />
                        <h4 className="text-[#F8FAFC] text-xs font-semibold uppercase tracking-widest font-sans">Ticket Dispatched</h4>
                        <p className="text-[11px] text-[#64748B] mt-2 font-mono">
                          INCIDENT CODE: <strong>#SENT-{Date.now().toString().slice(-4)}</strong>
                        </p>
                        <p className="text-[11px] text-[#94A3B8] mt-2 font-sans max-w-sm mx-auto">
                          Our engineering team has been notified. We are reviewing active access node logs.
                        </p>
                        <button
                          onClick={() => setIsSupportSubmitted(false)}
                          className="mt-5 px-5 py-2 bg-[#1A1A1C] hover:bg-[#262629] text-[#F8FAFC] border border-[#334155] rounded-lg font-sans text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                        >
                          New Request
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleSupportSubmit} className="space-y-4">
                        <div>
                          <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1.5 tracking-wider">
                            Description of Inquiry
                          </label>
                          <textarea
                            rows={4}
                            required
                            value={supportMessage}
                            onChange={(e) => setSupportMessage(e.target.value)}
                            placeholder="e.g. Node GT-SOUTH-04 camera lost connection after telemetry update. Requesting diagnostics."
                            className="w-full bg-[#161618] border border-[#1E293B] text-[#F8FAFC] rounded-xl focus:border-[#334155] placeholder-[#475569] px-4 py-3 text-xs outline-none transition-colors"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full py-3.5 bg-[#1A1A1C] hover:bg-[#262629] text-[#F8FAFC] border border-[#334155] font-sans font-medium text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                        >
                          Submit Support Ticket
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {currentTab === "settings" && (
                  <div className="max-w-2xl mx-auto bg-[#111113] border border-[#1E293B] rounded-2xl p-6 lg:p-8 shadow-xl mt-6">
                    <div className="flex items-center gap-3.5 mb-6">
                      <Wrench className="w-5 h-5 text-[#94A3B8]" />
                      <h2 className="font-serif text-lg font-light text-[#F8FAFC] tracking-wider">
                        Configuration Settings
                      </h2>
                    </div>

                    <div className="space-y-6">
                      {/* Section 1: Facial Recognition calibration */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-sans text-[10px] text-[#64748B] uppercase tracking-wider">Face Match Confidence Threshold</span>
                          <span className="font-mono text-[#F8FAFC] font-semibold">{facialThreshold}%</span>
                        </div>
                        <input
                          type="range"
                          min="90"
                          max="100"
                          step="0.1"
                          value={facialThreshold}
                          onChange={(e) => setFacialThreshold(parseFloat(e.target.value))}
                          className="w-full accent-[#94A3B8] bg-[#161618] rounded-lg h-1.5 cursor-pointer"
                        />
                        <p className="text-[10px] text-[#64748B] leading-relaxed font-sans">
                          Scans yielding high-dimensionality vector distances below this threshold trigger automatic denial of access.
                        </p>
                      </div>

                      <hr className="border-[#1E293B]/60" />

                      {/* Section 2: Hardware Node Status */}
                      <div className="space-y-4">
                        <h4 className="font-sans text-[10px] text-[#64748B] uppercase tracking-wider">
                          Uplink Node Telemetry
                        </h4>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[#161618] p-4 rounded-xl border border-[#1E293B]/60 flex items-center gap-3">
                            <Cpu className="w-4 h-4 text-[#94A3B8]" />
                            <div>
                              <div className="text-[9px] font-sans text-[#64748B] uppercase tracking-wider">Processor Temp</div>
                              <div className="text-xs font-semibold text-[#F8FAFC]">41.5°C (NOMINAL)</div>
                            </div>
                          </div>
                          <div className="bg-[#161618] p-4 rounded-xl border border-[#1E293B]/60 flex items-center gap-3">
                            <Database className="w-4 h-4 text-[#94A3B8]" />
                            <div>
                              <div className="text-[9px] font-sans text-[#64748B] uppercase tracking-wider">Ping Latency</div>
                              <div className="text-xs font-semibold text-[#F8FAFC]">12ms (STABLE)</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <hr className="border-[#1E293B]/60" />

                      {/* Section 3: Diagnostic Logs Terminal */}
                      <div className="bg-[#0A0A0B] rounded-xl p-4 border border-[#1E293B] font-mono text-[10px] text-emerald-500/80 space-y-1.5 overflow-x-auto select-all">
                        <p className="text-[#64748B]">// SENTINEL SECURE LINUX DAEMON STARTUP //</p>
                        <p>[OK] Loaded face_id_neural_weight.bin ... 128-dim vectors</p>
                        <p>[OK] RFID PN532 Reader initialized via I2C address 0x24</p>
                        <p>[OK] SG90 Servo motor calibrated to neutral secured 0°</p>
                        <p>[OK] Connected to Sentinel Cloud server: {window.location.origin}</p>
                        <p className="text-[#94A3B8] animate-pulse">SYSTEM READY. WAITING FOR ENTRY INTERACTION...</p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Persistent Biometric Intrusion Detection Modal Overlay */}
      <IncidentModal
        isOpen={isViolationOpen}
        incident={activeIncident}
        onClose={handleCloseViolation}
        onEscalate={() => {}}
        isAutomatedLockActive={isAutomatedLockActive}
      />

      {currentTab !== "dashboard" && (
        <PersistentCameraWidget onOpenDashboard={() => setCurrentTab("dashboard")} />
      )}

    </div>
  );
}
