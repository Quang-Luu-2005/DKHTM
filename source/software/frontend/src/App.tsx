/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { INITIAL_INCIDENT } from "./data";
import { User, AuditLog, HardwareState, SecurityIncident } from "./types";
import { api } from "./api";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import IncidentModal from "./components/IncidentModal";
import DashboardView from "./components/DashboardView";
import RegistrationView from "./components/RegistrationView";
import LogsView from "./components/LogsView";
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
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [hardware, setHardware] = useState<HardwareState>({
    servoArm: "SECURED / CLOSED",
    servoLocked: true,
    indicatorLed: "RED / RESTRICTED",
    systemBuzzer: "MUTED"
  });

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
      void api.updateHardware(automatedLockdownState).catch(console.error);
    }
  }, [logs]);

  // PostgreSQL is the source of truth; SSE keeps the dashboard current.
  useEffect(() => {
    let mounted = true;
    let pollInterval: number | undefined;

    const sync = async () => {
      try {
        const [remoteUsers, remoteLogs, remoteHardware] = await Promise.all([
          api.users(), api.logs(), api.hardware()
        ]);
        if (!mounted) return;

        setUsers(remoteUsers);
        setLogs(remoteLogs);
        setHardware(remoteHardware);
      } catch (error) {
        if (mounted) console.warn("Backend synchronization failed.", error);
      }
    };

    const startPollingFallback = () => {
      if (pollInterval !== undefined) return;
      pollInterval = window.setInterval(() => void sync(), 10000);
    };
    const stopPollingFallback = () => {
      if (pollInterval === undefined) return;
      window.clearInterval(pollInterval);
      pollInterval = undefined;
    };

    void sync();
    const unsubscribe = api.subscribe({
      onOpen: stopPollingFallback,
      onError: startPollingFallback,
      onAuditLog: event => {
        if (!mounted) return;
        setLogs(current => [event.data, ...current.filter(log => log.id !== event.data.id)]);
      },
      onHardwareState: event => {
        if (mounted) setHardware(event.data);
      }
    });
    return () => {
      mounted = false;
      stopPollingFallback();
      unsubscribe();
    };
  }, []);

  // Callback to insert manual logs
  const handleAddLog = (log: Omit<AuditLog, "id" | "timestamp">) => {
    void api.addLog(log).then(created => {
      setLogs(current => [created, ...current.filter(item => item.id !== created.id)]);
    }).catch(console.error);
  };

  const handleSaveUser = (user: User) => {
    setUsers(current => [user, ...current.filter(item => item.id !== user.id)]);
    void api.saveUser(user).then(saved => {
      setUsers(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      handleAddLog({ subjectName: saved.fullName, accessMethod: "Face ID", gateId: "GT-NORTH-01", status: "ONLINE", confidence: "100%" });
    }).catch(console.error);
  };

  const handleDeleteUser = (id: string) => {
    setUsers(current => current.filter(user => user.id !== id));
    void api.deleteUser(id).catch(console.error);
  };

  // Synchronize hardware changes
  const handleUpdateHardware = (hw: HardwareState) => {
    setHardware(hw);
    void api.updateHardware(hw).then(updated => setHardware(updated)).catch(console.error);
  };

  // Trigger Emergency system lockdown
  const handleToggleEmergencyLock = () => {
    const nextLocked = !isEmergencyLocked;
    setIsEmergencyLocked(nextLocked);

    if (!nextLocked) {
      setIsAutomatedLockActive(false);
    }

    if (nextLocked) {
      // Set hardware to lockdown state
      const lockedState: HardwareState = {
        servoArm: "SECURED / CLOSED",
        servoLocked: true,
        indicatorLed: "RED / RESTRICTED",
        systemBuzzer: "ACTIVE"
      };
      handleUpdateHardware(lockedState);

      // Add audit log entry
      handleAddLog({
        subjectName: "Emergency Override",
        accessMethod: "Manual Override",
        gateId: "SYS-CORE-01",
        status: "VIOLATION",
        confidence: "N/A"
      });
    } else {
      // Release hardware
      const normalState: HardwareState = {
        servoArm: "SECURED / CLOSED",
        servoLocked: true,
        indicatorLed: "RED / RESTRICTED",
        systemBuzzer: "MUTED"
      };
      handleUpdateHardware(normalState);

      handleAddLog({
        subjectName: "Lock Release",
        accessMethod: "Manual Override",
        gateId: "SYS-CORE-01",
        status: "ONLINE",
        confidence: "N/A"
      });
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

    // Set hardware indicators to high-alarm lockdown
    handleUpdateHardware({
      servoArm: "SECURED / CLOSED",
      servoLocked: true,
      indicatorLed: "RED / RESTRICTED",
      systemBuzzer: "ACTIVE"
    });

    // Write a violation directly to logs
    handleAddLog({
      subjectName: subjectName,
      accessMethod: accessMethod,
      gateId: "GT-NORTH-01",
      status: "VIOLATION",
      confidence: "N/A"
    });
  };

  // Dismiss threat modal
  const handleCloseViolation = () => {
    setIsViolationOpen(false);
    // Reset hardware buzzer
    handleUpdateHardware({
      ...hardware,
      systemBuzzer: "MUTED"
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
                    logs={logs}
                    isEmergencyLocked={isEmergencyLocked}
                  />
                )}

                {currentTab === "registration" && (
                  <RegistrationView
                    users={users}
                    onSaveUser={handleSaveUser}
                    onDeleteUser={handleDeleteUser}
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

    </div>
  );
}
