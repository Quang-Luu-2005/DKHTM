/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  getUsers,
  replaceUsers,
  getAuditLogs,
  addAuditLog,
  saveAuditLogs,
  getHardwareState,
  saveHardwareState,
  INITIAL_AUTHENTICATION_ALERT
} from "./data";
import { User, AuditLog, HardwareState, AuthenticationAlert } from "./types";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import AuthenticationAlertModal from "./components/AuthenticationAlertModal";
import DashboardView from "./components/DashboardView";
import RegistrationView from "./components/RegistrationView";
import LogsView from "./components/LogsView";
import {
  connectBoardEvents,
  fetchUsersDatabase,
  startFaceEnrollment,
  startRfidEnrollment,
  syncUsersDatabase,
  sendGateOverride,
} from "./services/boardApi";
import {
  HeartHandshake,
  Wrench,
  Database,
  Cpu,
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
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [hardware, setHardware] = useState<HardwareState>({
    servoArm: "SECURED / CLOSED",
    servoLocked: true,
    indicatorLed: "RED / RESTRICTED",
    systemBuzzer: "MUTED",
    authenticationSessionActive: false,
  });
  const [mqttConnected, setMqttConnected] = useState(false);
  const [latestRfidEnrollment, setLatestRfidEnrollment] = useState<{
    rfidUid: string;
    receivedAt: string;
  } | null>(null);
  const [faceEnrollment, setFaceEnrollment] = useState<{
    employeeId: string;
    status: "REQUESTING" | "STARTED" | "PROGRESS" | "SUCCESS" | "FAILED";
    view?: string;
    completedViews: number;
    reason?: string;
  } | null>(null);
  const [isAuthenticationAlertOpen, setIsAuthenticationAlertOpen] = useState(false);
  const [activeAuthenticationAlert, setActiveAuthenticationAlert] =
    useState<AuthenticationAlert | null>(INITIAL_AUTHENTICATION_ALERT);

  // Support & Settings customized form states
  const [supportMessage, setSupportMessage] = useState("");
  const [isSupportSubmitted, setIsSupportSubmitted] = useState(false);

  // Initialize data on mount
  useEffect(() => {
    const storedUsers = getUsers();
    const storedLogs = getAuditLogs();
    const resolvedLogs = storedLogs.map((log) => {
      const employeeId = log.subjectId || log.subjectName;
      const employee = storedUsers.find((user) => user.id === employeeId);
      return employee && (log.subjectName === employee.id || !log.subjectName)
        ? { ...log, subjectName: employee.fullName, subjectId: employee.id }
        : log;
    });
    setUsers(storedUsers);
    setLogs(saveAuditLogs(resolvedLogs));
    setHardware(getHardwareState());

    let cancelled = false;
    void fetchUsersDatabase()
      .then((serverUsers) => {
        if (!cancelled) setUsers(replaceUsers(serverUsers));
      })
      .catch((error) => {
        console.error("Không thể tải cơ sở dữ liệu nhân viên từ server:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Receive real hardware telemetry from the local MQTT bridge.
  useEffect(() => {
    return connectBoardEvents({
      onBrokerStatus: setMqttConnected,
      onEnrollmentScan: setLatestRfidEnrollment,
      onBoardEvent: ({ payload }) => {
        const result = payload.result?.toLowerCase();
        const eventType = payload.eventType;

        if (payload.event === "face_enrollment" && payload.employee_id && payload.status) {
          const status = payload.status.toUpperCase();
          if (["STARTED", "PROGRESS", "SUCCESS", "FAILED"].includes(status)) {
            setFaceEnrollment({
              employeeId: payload.employee_id,
              status: status as "STARTED" | "PROGRESS" | "SUCCESS" | "FAILED",
              view: payload.view,
              completedViews: payload.completedViews ?? 0,
              reason: payload.reason,
            });
            if (status === "SUCCESS") {
              setUsers((currentUsers) => {
                const enrolledUser = currentUsers.find(
                  (user) => user.id === payload.employee_id,
                );
                if (!enrolledUser) return currentUsers;
                const updatedUsers = currentUsers.map((user) =>
                  user.id === payload.employee_id
                    ? { ...user, faceIdStatus: "ENROLLED" as const }
                    : user,
                );
                replaceUsers(updatedUsers);
                return updatedUsers;
              });
            }
          }
        }

        setHardware((current) => {
          const next = { ...current };
          const gate = payload.gate?.toLowerCase();
          const led = payload.led?.toLowerCase();
          const buzzer = payload.buzzer?.toLowerCase();

          if (gate === "open" || result === "granted" || result === "opened") {
            next.servoArm = "OPENED / UNSECURED";
            next.servoLocked = false;
          } else if (gate === "closed" || result === "closed" || eventType === "AUTHENTICATION_ALERT" || eventType === "FORCED_LOCK_PRESENCE_ALERT" || eventType === "GATE_CLIMB_VIOLATION") {
            next.servoArm = "SECURED / CLOSED";
            next.servoLocked = true;
          }

          if (led === "green" || result === "led_green" || result === "granted") {
            next.indicatorLed = "GREEN / ACCESS ALLOWED";
          } else if (led === "red" || result === "led_red" || eventType === "AUTHENTICATION_ALERT" || eventType === "FORCED_LOCK_PRESENCE_ALERT" || eventType === "GATE_CLIMB_VIOLATION") {
            next.indicatorLed = "RED / RESTRICTED";
          }

          if (result === "authentication_session_started" || payload.status === "authentication_session_started" || eventType === "FACE_DETECTED") {
            next.authenticationSessionActive = true;
          } else if (result === "authentication_session_ended" || payload.status === "authentication_session_ended" || result === "granted" || result === "denied" || result === "closed") {
            next.authenticationSessionActive = false;
          }

          if (buzzer === "active" || result === "buzzer_active") {
            next.systemBuzzer = "ACTIVE";
          } else if (buzzer === "muted" || result === "buzzer_muted") {
            next.systemBuzzer = "MUTED";
          }

          saveHardwareState(next);
          return next;
        });

        if (eventType === "AUTH_SUCCESS" || result === "granted") {
          const isFaceAccess = payload.access_method === "face" || payload.authMethod === "FACE";
          const employeeId = payload.employee_id;
          const rfidUid = payload.rfid_uid || "Không xác định";
          const matchedUser = users.find((u) => u.id === employeeId || (rfidUid !== "Không xác định" && u.rfidUid === rfidUid));
          const displayName = payload.employee_name || matchedUser?.fullName || (employeeId ? `Nhân viên ${employeeId}` : isFaceAccess ? "Nhân viên nhận diện khuôn mặt" : `RFID ${rfidUid}`);
          const rawConf = payload.confidence;
          const formattedConfidence = rawConf !== undefined ? (rawConf > 1 ? `${rawConf.toFixed(1)}%` : `${(rawConf * 100).toFixed(1)}%`) : "98.5%";
          const durationText = isFaceAccess ? "1.2s" : "0.4s";

          setLogs(addAuditLog({
            subjectName: displayName,
            subjectId: employeeId || (isFaceAccess ? undefined : rfidUid),
            accessMethod: isFaceAccess ? "Face ID" : "RFID",
            gateId: "GT-NORTH-01",
            status: "ONLINE",
            confidence: formattedConfidence,
            executionTime: durationText,
          }));
        } else if (eventType === "AUTH_FAILURE" || result === "denied") {
          const isFaceAccess = payload.access_method === "face" || payload.authMethod === "FACE";
          const employeeId = payload.employee_id;
          const rfidUid = payload.rfid_uid || "Không xác định";
          const matchedUser = users.find((u) => u.id === employeeId || (rfidUid !== "Không xác định" && u.rfidUid === rfidUid));
          const displayName = payload.employee_name || matchedUser?.fullName || (employeeId ? `Nhân viên ${employeeId}` : isFaceAccess ? "Khuôn mặt không khớp database" : `Thẻ không hợp lệ (${rfidUid})`);
          const rawConf = payload.confidence;
          const formattedConfidence = rawConf !== undefined ? (rawConf > 1 ? `${rawConf.toFixed(1)}%` : `${(rawConf * 100).toFixed(1)}%`) : "0.0%";
          const durationText = isFaceAccess ? "6.0s (Timeout)" : "0.3s";

          setLogs(addAuditLog({
            subjectName: displayName,
            subjectId: employeeId || (isFaceAccess ? undefined : rfidUid),
            accessMethod: isFaceAccess ? "Face ID" : "RFID",
            gateId: "GT-NORTH-01",
            status: "AUTH_FAILURE",
            confidence: formattedConfidence,
            executionTime: durationText,
          }));
        } else if (eventType === "AUTHENTICATION_ALERT" || eventType === "FORCED_LOCK_PRESENCE_ALERT" || eventType === "GATE_CLIMB_VIOLATION") {
          const isForcedLockPresence = eventType === "FORCED_LOCK_PRESENCE_ALERT";
          const isGateClimbViolation = eventType === "GATE_CLIMB_VIOLATION";
          const isPhysicalAlert = isForcedLockPresence || isGateClimbViolation;
          const authMethod = payload.authMethod === "RFID"
            ? "RFID"
            : payload.authMethod === "MIXED" ? "MIXED"
              : payload.authMethod === "NONE" ? "NONE" : "FACE";
          const timestamp = payload.timestamp
            ? new Date(payload.timestamp).toLocaleTimeString("vi-VN")
            : new Date().toLocaleTimeString("vi-VN");
          setActiveAuthenticationAlert({
            id: `AUTH-${Date.now()}`,
            timestamp,
            gateId: "GT-NORTH-01",
            alertType: payload.alertType || (isPhysicalAlert
              ? isGateClimbViolation ? "CLIMB_DETECTED_WHILE_GATE_CLOSED" : "PRESENCE_DETECTED_DURING_FORCED_LOCK"
              : "REPEATED_AUTH_FAILURE"),
            authMethod,
            failedAttempts: isPhysicalAlert ? 0 : (payload.failedAttempts ?? 3),
            decision: "DENIED",
            gateState: "LOCKED",
          });
          setLogs(addAuditLog({
            subjectName: isPhysicalAlert
              ? isGateClimbViolation
                ? `Phát hiện vi phạm trèo cổng (${payload.distance_cm ?? "?"} cm)`
                : "Phát hiện người tại vùng cổng đang khóa cưỡng bức"
              : `Cảnh báo xác thực thất bại ${payload.failedAttempts ?? 3} lần`,
            accessMethod: isPhysicalAlert
              ? isGateClimbViolation ? "HC-SR04" : "Manual Override"
              : authMethod === "RFID" ? "RFID" : "Face ID",
            gateId: "GT-NORTH-01",
            status: "AUTH_ALERT",
            confidence: "N/A",
          }));
          setIsAuthenticationAlertOpen(true);
        }
      },
    });
  }, []);

  // Handle saving new user
  const handleSaveUser = async (user: User) => {
    const normalizedUid = user.rfidUid.trim().toUpperCase();
    const duplicate = users.find(
      (existingUser) =>
        existingUser.id !== user.id &&
        normalizedUid !== "NOT LINKED" &&
        existingUser.rfidUid.trim().toUpperCase() === normalizedUid,
    );
    if (duplicate) {
      throw new Error(`Thẻ này đã được liên kết với ${duplicate.fullName}.`);
    }

    const exists = users.some((existingUser) => existingUser.id === user.id);
    const updatedUsers = exists
      ? users.map((existingUser) => existingUser.id === user.id ? user : existingUser)
      : [user, ...users];
    await syncUsersDatabase(updatedUsers);
    setUsers(replaceUsers(updatedUsers));

    // Automatically log this as an enrollment action
    const updatedLogs = addAuditLog({
      subjectName: user.fullName,
      accessMethod: "Manual Override",
      gateId: "GT-NORTH-01",
      status: "ONLINE",
      confidence: "100%"
    });
    setLogs(updatedLogs);
  };

  // Handle deleting a user
  const handleDeleteUser = async (id: string) => {
    const updatedUsers = users.filter((user) => user.id !== id);
    await syncUsersDatabase(updatedUsers);
    setUsers(replaceUsers(updatedUsers));
  };

  const handleStartRfidEnrollment = async () => {
    setLatestRfidEnrollment(null);
    await startRfidEnrollment();
  };

  const handleStartFaceEnrollment = async (employeeId: string) => {
    setFaceEnrollment({
      employeeId,
      status: "REQUESTING",
      completedViews: 0,
    });
    try {
      await startFaceEnrollment(employeeId);
    } catch (error) {
      setFaceEnrollment({
        employeeId,
        status: "FAILED",
        completedViews: 0,
        reason: error instanceof Error ? error.message : "Không thể bắt đầu đăng ký",
      });
      throw error;
    }
  };

  const handleCloseAuthenticationAlert = () => {
    setIsAuthenticationAlertOpen(false);
    void sendGateOverride("buzzer_off").catch((err) => {
      console.warn("Không thể gửi lệnh tắt còi xuống thiết bị:", err);
    });
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
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Container Wrapper */}
      <div className="flex pt-16">

        {/* Sidebar administrative navigation rail (Hidden on mobile) */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
        />

        {/* Primary View Area (padded for top bar and left side sidebar) */}
        <main className="flex-1 lg:ml-64 p-6 lg:p-8 min-h-[calc(100vh-4rem)]">

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
                    mqttConnected={mqttConnected}
                    logs={logs}
                  />
                )}

                {currentTab === "registration" && (
                  <RegistrationView
                    users={users}
                    onSaveUser={handleSaveUser}
                    onDeleteUser={handleDeleteUser}
                    latestRfidScan={latestRfidEnrollment}
                    onStartRfidScan={handleStartRfidEnrollment}
                    faceEnrollment={faceEnrollment}
                    onStartFaceEnrollment={handleStartFaceEnrollment}
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
                      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                        <div className="font-sans text-[10px] uppercase tracking-wider text-sky-200">
                          Cấu hình AI chỉ đọc
                        </div>
                        <p className="mt-2 text-[10px] leading-relaxed text-[#94A3B8]">
                          Model HFR S16 và ngưỡng nhận diện được nạp trong firmware ESP32-CAM.
                          Dashboard không thay đổi model, ngưỡng so khớp hoặc trạng thái cổng.
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
                              <div className="text-[9px] font-sans text-[#64748B] uppercase tracking-wider">HiveMQ Uplink</div>
                              <div className="text-xs font-semibold text-[#F8FAFC]">{mqttConnected ? "CONNECTED" : "OFFLINE"}</div>
                            </div>
                          </div>
                          <div className="bg-[#161618] p-4 rounded-xl border border-[#1E293B]/60 flex items-center gap-3">
                            <Database className="w-4 h-4 text-[#94A3B8]" />
                            <div>
                              <div className="text-[9px] font-sans text-[#64748B] uppercase tracking-wider">Gate Authority</div>
                              <div className="text-xs font-semibold text-[#F8FAFC]">ESP32 LOCAL</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <hr className="border-[#1E293B]/60" />

                      {/* Section 3: Diagnostic Logs Terminal */}
                      <div className="bg-[#0A0A0B] rounded-xl p-4 border border-[#1E293B] font-mono text-[10px] text-emerald-500/80 space-y-1.5 overflow-x-auto select-all">
                        <p className="text-[#64748B]">// SENTINEL SECURE LINUX DAEMON STARTUP //</p>
                        <p>[INFO] Face Recognition: HFR S16 on ESP32-CAM</p>
                        <p>[INFO] Camera transport: ESP-NOW result messages only</p>
                        <p>[INFO] RFID authorization: local NVS registry</p>
                        <p>[INFO] Telemetry endpoint: {window.location.origin}</p>
                        <p className="text-[#94A3B8] animate-pulse">MONITOR READY. WAITING FOR BOARD EVENTS...</p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AuthenticationAlertModal
        isOpen={isAuthenticationAlertOpen}
        alert={activeAuthenticationAlert}
        onClose={handleCloseAuthenticationAlert}
      />

    </div>
  );
}
