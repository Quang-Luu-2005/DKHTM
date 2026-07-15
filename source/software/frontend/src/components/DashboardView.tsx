import React from "react";
import { 
  Users, 
  AlertTriangle, 
  DoorClosed, 
  DoorOpen, 
  Lightbulb, 
  Volume2, 
  VolumeX, 
  Activity, 
  Maximize2,
  Loader2,
  Lock,
  Unlock
} from "lucide-react";
import { AuditLog, HardwareState } from "../types";

interface DashboardViewProps {
  hardware: HardwareState;
  onUpdateHardware: (hw: HardwareState) => void;
  logs: AuditLog[];
  onAddLog: (log: Omit<AuditLog, "id" | "timestamp">) => void;
  isEmergencyLocked: boolean;
}

export default function DashboardView({
  hardware,
  onUpdateHardware,
  logs,
  onAddLog,
  isEmergencyLocked
}: DashboardViewProps) {
  const cameraBaseUrl = (import.meta.env.VITE_CAMERA_URL || "").replace(/\/$/, "");
  const cameraStreamUrl = cameraBaseUrl
    ? `${cameraBaseUrl}/stream?detect=1&detectEvery=5&quality=60&delay=0`
    : "https://lh3.googleusercontent.com/aida-public/AB6AXuDQEaScEEtCFS5Bn2sUz-z6g3_PdMNTHi4JIU0cPL7N7j1NxLFSFf1CgUuP_LO7eqkBMcW0tXWT-JTOAxSyEZaIyqR5HlSi7Bfo9Y2Ols_j3n7ovO_rf2bEnXwMylDHc2GfW4Kf23o8rs_MtiCjaPTjTtDuRgtZKY9KqucI_507qN1vvtqPW9xqdG8xlgHqJGclmrR0YH7kkdYwu_ePLJDFGf6S5rOSyl4D2DYMQltRPzJQGshnWlfrm3-myEiALI5_Tc5B1QRd87Y";
  const [timeStr, setTimeStr] = React.useState("");
  const [servoLoading, setServoLoading] = React.useState(false);
  const [lightsLoading, setLightsLoading] = React.useState(false);
  const [buzzerLoading, setBuzzerLoading] = React.useState(false);

  // Active status totals
  const totalToday = logs.filter(l => l.status === "ONLINE").length * 15 + 420;
  const violationCount = logs.filter(l => l.status === "VIOLATION").length;

  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const formatNum = (n: number) => n.toString().padStart(2, "0");
      setTimeStr(
        `${now.getFullYear()}-${formatNum(now.getMonth() + 1)}-${formatNum(
          now.getDate()
        )} ${formatNum(now.getHours())}:${formatNum(now.getMinutes())}:${formatNum(
          now.getSeconds()
        )}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const translateLed = (led: string) => {
    if (led.includes("GREEN")) return "XANH / ĐƯỢC PHÉP VÀO";
    if (led.includes("RED")) return "ĐỎ / HẠN CHẾ";
    return led;
  };

  const translateServo = (servo: string) => {
    if (servo.includes("SECURED") || servo.includes("CLOSED")) return "ĐANG KHÓA AN TOÀN";
    if (servo.includes("OPENED") || servo.includes("UNSECURED")) return "ĐANG MỞ";
    return servo;
  };

  const translateBuzzer = (buzzer: string) => {
    if (buzzer === "ACTIVE") return "ĐANG BẬT";
    if (buzzer === "MUTED") return "ĐANG TẮT ÂM";
    return buzzer;
  };

  const translateAccessMethod = (method: string) => {
    switch (method) {
      case "Face ID": return "Xác thực Khuôn mặt";
      case "RFID": return "Thẻ từ RFID";
      case "Manual Override": return "Ghi đè thủ công";
      case "Gate Jumping / Climbing detected": return "Phát hiện nhảy/trèo cổng";
      case "Tailgating detected": return "Phát hiện bám đuôi";
      default: return method;
    }
  };

  const handleForceLockUnlock = (lock: boolean) => {
    if (servoLoading) return;
    if (isEmergencyLocked && !lock) {
      alert("Hệ thống đang trong trạng thái phong tỏa khẩn cấp! Vui lòng giải phóng phong tỏa để điều khiển cổng.");
      return;
    }
    setServoLoading(true);

    setTimeout(() => {
      onUpdateHardware({
        ...hardware,
        servoLocked: lock,
        servoArm: lock ? "SECURED / CLOSED" : "OPENED / UNSECURED"
      });

      onAddLog({
        subjectName: lock ? "Khóa khẩn cấp thủ công" : "Mở cưỡng bức thủ công",
        accessMethod: "Manual Override",
        gateId: "GT-NORTH-01",
        status: "ONLINE",
        confidence: "100%"
      });

      setServoLoading(false);
    }, 1500);
  };

  const handleToggleLights = () => {
    if (lightsLoading || isEmergencyLocked) return;
    setLightsLoading(true);

    setTimeout(() => {
      const isRed = hardware.indicatorLed.includes("RED");
      onUpdateHardware({
        ...hardware,
        indicatorLed: isRed ? "GREEN / ACCESS ALLOWED" : "RED / RESTRICTED"
      });
      setLightsLoading(false);
    }, 1500);
  };

  const handleToggleBuzzer = () => {
    if (buzzerLoading || isEmergencyLocked) return;
    setBuzzerLoading(true);

    setTimeout(() => {
      onUpdateHardware({
        ...hardware,
        systemBuzzer: hardware.systemBuzzer === "ACTIVE" ? "MUTED" : "ACTIVE"
      });
      setBuzzerLoading(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Upper Status Bar */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl font-light text-[#F8FAFC] tracking-wide">
            Giám sát Hoạt động Ra vào
          </h1>
          <p className="text-[10px] text-[#64748B] mt-1 font-mono uppercase tracking-widest">
            NODE UPLINK: ESP32_SEC_01 • CỔNG CHÍNH SẢNH
          </p>
        </div>
        <div className="flex shrink-0">
          <div className="flex items-center gap-2 bg-[#111113] px-3.5 py-1.5 rounded-xl border border-[#1E293B]">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="font-mono text-[9px] font-semibold text-[#94A3B8] tracking-widest uppercase">
              Luồng truyền tải Ổn định
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Security Feed & Summary KPIs */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          {/* Simulated Camera Feed View */}
          <div className="relative aspect-video bg-[#111113] rounded-2xl border border-[#1E293B] overflow-hidden shadow-xl group" title="Luồng Camera trực tiếp (ESP32-CAM)">
            {/* Ambient lobby camera stream */}
            <div className="absolute inset-0 shimmer opacity-[0.03]" />
            <img
              alt="Luồng camera trực tiếp từ sảnh tòa nhà"
              src={cameraStreamUrl}
              className="w-full h-full object-cover grayscale brightness-75 contrast-[1.05]"
            />

            {/* Simulated target box overlay */}
            <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
              {/* Top Banner */}
              <div className="flex justify-between items-start">
                <div className="bg-black/85 backdrop-blur-md px-3 py-1.5 border border-[#1E293B] rounded-lg flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping shrink-0" />
                  <span className="font-mono text-[9px] font-bold text-[#94A3B8] tracking-widest uppercase">
                    TRỰC TIẾP // LUỒNG CAMERA (ESP32-CAM)
                  </span>
                </div>
                <div className="bg-black/85 backdrop-blur-md px-4 py-1.5 border border-[#1E293B] rounded-lg font-mono text-[#94A3B8] text-xs">
                  {timeStr || "2026-06-27 14:32:01"}
                </div>
              </div>

              {/* Middle wireframe bounds */}
              <div className="absolute top-[30%] left-[35%] w-[30%] h-[40%] border border-dashed border-[#94A3B8]/30 rounded-xl flex items-center justify-center">
                <span className="font-mono text-[8px] text-[#94A3B8] tracking-widest bg-black/75 px-2.5 py-1 rounded border border-[#1E293B] uppercase">
                  Phân tích Trắc sinh học
                </span>
              </div>

              {/* Bottom Details */}
              <div className="flex justify-between items-end">
                <div className="flex flex-col gap-1.5">
                  <div className="bg-black/75 border border-[#1E293B] text-[#94A3B8] text-[8px] font-mono font-medium px-2 py-1 rounded tracking-widest uppercase">
                    Phát hiện sự hiện diện
                  </div>
                  <div className="bg-black/75 border border-[#1E293B] text-[#94A3B8] text-[8px] font-mono font-medium px-2 py-1 rounded tracking-widest uppercase">
                    Đang quét nơ-ron
                  </div>
                </div>
                <button className="bg-black/75 hover:bg-[#1A1A1C] p-2 rounded-lg border border-[#1E293B] text-[#94A3B8] pointer-events-auto active:scale-90 transition-transform">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Surveillance crosshairs */}
            <div className="absolute top-6 left-6 w-4 h-4 border-t border-l border-[#1E293B]" />
            <div className="absolute top-6 right-6 w-4 h-4 border-t border-r border-[#1E293B]" />
            <div className="absolute bottom-6 left-6 w-4 h-4 border-b border-l border-[#1E293B]" />
            <div className="absolute bottom-6 right-6 w-4 h-4 border-b border-r border-[#1E293B]" />
          </div>

          {/* KPI Widget Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* KPI: Connection Status */}
            <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors">
              <div className="flex justify-between items-start mb-2">
                <span className="font-sans text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">
                  Trạng thái Kết nối
                </span>
                <span className="font-mono text-[9px] text-[#10B981] bg-emerald-500/10 px-2 py-0.5 rounded uppercase font-semibold">Ổn định</span>
              </div>
              <div className="text-3xl font-serif font-light text-[#F8FAFC] mt-2">
                {totalToday} <span className="text-xs font-sans text-[#64748B] uppercase tracking-wide">Lượt Ra Vào</span>
              </div>
              <p className="text-[9px] font-mono text-[#64748B] mt-2.5 uppercase tracking-wider">LUỒNG TRUYỀN TẢI HOẠT ĐỘNG • TELEMETRY NODE ESP32 BÌNH THƯỜNG</p>
              <div className="h-6 w-full mt-4 overflow-hidden opacity-40">
                <svg className="w-full h-full text-[#94A3B8]" preserveAspectRatio="none" viewBox="0 0 100 20">
                  <path d="M0 15 Q 10 5, 20 12 T 40 8 T 60 14 T 80 5 T 100 10" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              </div>
            </div>

            {/* KPI: System Health */}
            <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-rose-500/40 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <span className="font-sans text-[10px] text-[#64748B] uppercase tracking-widest font-semibold">
                  Sức khỏe Hệ thống
                </span>
                <span className={`font-mono text-[9px] px-2 py-0.5 rounded uppercase font-semibold ${
                  violationCount > 0 ? "bg-amber-500/10 text-amber-400 animate-pulse" : "bg-emerald-500/10 text-[#10B981]"
                }`}>
                  {violationCount > 0 ? "Ghi nhận Sự cố" : "An toàn"}
                </span>
              </div>
              <div className="text-3xl font-serif font-light text-[#F8FAFC] mt-2">
                {violationCount === 0 ? "100%" : "94%"} <span className="text-xs font-sans text-[#64748B] uppercase tracking-wide">Khả dụng</span>
              </div>
              <p className="text-[9px] font-mono text-rose-500/80 mt-2.5 uppercase tracking-wider">
                {violationCount === 0 ? "Không phát hiện xâm nhập hay vi phạm hoạt động" : `Đã giảm thiểu ${violationCount} sự cố xâm nhập`}
              </p>
              <div className="h-6 w-full mt-4 overflow-hidden opacity-40">
                <svg className="w-full h-full text-rose-500" preserveAspectRatio="none" viewBox="0 0 100 20">
                  <path d="M0 10 Q 10 18, 20 10 T 40 15 T 60 5 T 80 12 T 100 8" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Hardware Status & Live Activity logs */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {/* Gate Hardware Status Console */}
          <div className="bg-[#111113] p-6 rounded-2xl border border-[#1E293B]">
            <h3 className="font-serif text-sm font-light text-[#F8FAFC] mb-6 tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#94A3B8]" />
              Trạng thái thiết bị phần cứng
            </h3>

            <div className="space-y-4">
              {/* Servo Arm indicator and controller */}
              <div className="flex flex-col gap-3.5 p-4 bg-[#161618] border border-[#1E293B]/60 rounded-xl transition-all hover:border-[#334155]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                      servoLoading 
                        ? "bg-blue-500/5 text-blue-400" 
                        : hardware.servoLocked 
                        ? "bg-rose-500/5 text-rose-400" 
                        : "bg-emerald-500/5 text-[#10B981]"
                    }`}>
                      {servoLoading ? (
                        <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      ) : hardware.servoLocked ? (
                        <DoorClosed className="w-4.5 h-4.5" />
                      ) : (
                        <DoorOpen className="w-4.5 h-4.5" />
                      )}
                    </div>
                    <div>
                      <div className="font-mono text-[8px] text-[#64748B] uppercase tracking-wider">Trạng thái Thanh chắn (Servo)</div>
                      <div className="text-xs font-semibold text-[#F8FAFC] mt-0.5 uppercase tracking-wide">
                        {servoLoading ? "ĐANG CẤU HÌNH LẠI..." : translateServo(hardware.servoArm)}
                      </div>
                    </div>
                  </div>
                  <div className={`px-2.5 py-0.5 rounded text-[8px] font-mono uppercase font-semibold border ${
                    servoLoading 
                      ? "bg-blue-950/20 text-blue-300 border-blue-500/20 animate-pulse" 
                      : hardware.servoLocked 
                      ? "bg-rose-950/20 text-rose-300 border-rose-500/20" 
                      : "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                  }`}>
                    {servoLoading ? "Đang đồng bộ" : hardware.servoLocked ? "Đang khóa an toàn" : "Đang mở"}
                  </div>
                </div>

                {/* Force Lock / Unlock Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#1E293B]/30">
                  <button
                    onClick={() => handleForceLockUnlock(true)}
                    disabled={servoLoading || isEmergencyLocked || hardware.servoLocked}
                    className={`flex-grow py-2 rounded-lg font-sans text-[9px] uppercase tracking-wider font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      hardware.servoLocked
                        ? "bg-[#111113]/40 border-transparent text-[#475569] cursor-not-allowed"
                        : isEmergencyLocked
                        ? "bg-[#111113]/40 border-transparent text-[#475569] cursor-not-allowed"
                        : servoLoading
                        ? "bg-[#1A1A1C] border-[#1E293B] text-[#64748B] cursor-wait"
                        : "bg-[#111113] hover:bg-[#1C1C1F] text-rose-400 hover:text-rose-300 border-[#1E293B] hover:border-rose-500/30 cursor-pointer active:scale-[0.98]"
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    Khóa khẩn cấp
                  </button>
                  <button
                    onClick={() => handleForceLockUnlock(false)}
                    disabled={servoLoading || isEmergencyLocked || !hardware.servoLocked}
                    className={`flex-grow py-2 rounded-lg font-sans text-[9px] uppercase tracking-wider font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      !hardware.servoLocked
                        ? "bg-[#111113]/40 border-transparent text-[#475569] cursor-not-allowed"
                        : isEmergencyLocked
                        ? "bg-[#111113]/40 border-transparent text-[#475569] cursor-not-allowed"
                        : servoLoading
                        ? "bg-[#1A1A1C] border-[#1E293B] text-[#64748B] cursor-wait"
                        : "bg-[#111113] hover:bg-[#1C1C1F] text-emerald-400 hover:text-emerald-300 border-[#1E293B] hover:border-emerald-500/30 cursor-pointer active:scale-[0.98]"
                    }`}
                  >
                    <Unlock className="w-3 h-3" />
                    Mở cưỡng bức
                  </button>
                </div>
              </div>

              {/* Indicator LED Card with Switch */}
              <div className="flex items-center justify-between p-4 bg-[#161618] border border-[#1E293B]/60 rounded-xl transition-all hover:border-[#334155]">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                    lightsLoading 
                      ? "bg-blue-500/5 text-blue-400" 
                      : hardware.indicatorLed.includes("RED") 
                      ? "bg-rose-500/5 text-rose-400" 
                      : "bg-emerald-500/5 text-[#10B981]"
                  }`}>
                    {lightsLoading ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : (
                      <Lightbulb className="w-4.5 h-4.5" />
                    )}
                  </div>
                  <div>
                    <div className="font-mono text-[8px] text-[#64748B] uppercase tracking-wider">Đèn tín hiệu cổng</div>
                    <div className="text-xs font-semibold text-[#F8FAFC] mt-0.5 uppercase tracking-wide">
                      {lightsLoading ? "ĐANG HIỆU CHỈNH..." : translateLed(hardware.indicatorLed)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Status indicator dot */}
                  {!lightsLoading && (
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
                      hardware.indicatorLed.includes("RED") ? "bg-rose-500 animate-pulse" : "bg-[#10B981]"
                    }`} />
                  )}

                  {/* Interactive Toggle Switch */}
                  <button
                    onClick={handleToggleLights}
                    disabled={lightsLoading || isEmergencyLocked}
                    className={`relative inline-flex items-center h-5.5 rounded-full w-10 transition-colors cursor-pointer border ${
                      isEmergencyLocked 
                        ? "bg-[#1A1A1C]/50 border-transparent cursor-not-allowed opacity-50"
                        : lightsLoading
                        ? "bg-[#1A1A1C] border-[#1E293B] cursor-wait"
                        : hardware.indicatorLed.includes("GREEN")
                        ? "bg-emerald-950/60 border-emerald-500/30"
                        : "bg-rose-950/60 border-rose-500/30"
                    }`}
                  >
                    <span
                      className={`inline-block w-3.5 h-3.5 transform rounded-full transition-transform ${
                        lightsLoading
                          ? "translate-x-3 bg-blue-400 animate-pulse"
                          : hardware.indicatorLed.includes("GREEN")
                          ? "translate-x-5.5 bg-[#10B981]"
                          : "translate-x-1 bg-rose-500"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* System Buzzer Toggle Switch Card */}
              <div className="flex items-center justify-between p-4 bg-[#161618] border border-[#1E293B]/60 rounded-xl transition-all hover:border-[#334155]">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                    buzzerLoading 
                      ? "bg-blue-500/5 text-blue-400" 
                      : hardware.systemBuzzer === "ACTIVE" 
                      ? "bg-amber-500/5 text-amber-400" 
                      : "bg-[#1A1A1C] text-[#64748B]"
                  }`}>
                    {buzzerLoading ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : hardware.systemBuzzer === "ACTIVE" ? (
                      <Volume2 className="w-4.5 h-4.5" />
                    ) : (
                      <VolumeX className="w-4.5 h-4.5" />
                    )}
                  </div>
                  <div>
                    <div className="font-mono text-[8px] text-[#64748B] uppercase tracking-wider">Còi báo động (Buzzer)</div>
                    <div className="text-xs font-semibold text-[#F8FAFC] mt-0.5 uppercase tracking-wide">
                      {buzzerLoading ? "ĐANG TRUYỀN TÍN HIỆU..." : translateBuzzer(hardware.systemBuzzer)}
                    </div>
                  </div>
                </div>

                {/* Custom Toggle Switch */}
                <button
                  onClick={handleToggleBuzzer}
                  disabled={buzzerLoading || isEmergencyLocked}
                  className={`relative inline-flex items-center h-5.5 rounded-full w-10 transition-colors cursor-pointer border ${
                    isEmergencyLocked 
                      ? "bg-[#1A1A1C]/50 border-transparent cursor-not-allowed opacity-50"
                      : buzzerLoading
                      ? "bg-[#1A1A1C] border-[#1E293B] cursor-wait"
                      : hardware.systemBuzzer === "ACTIVE"
                      ? "bg-amber-950/60 border-amber-500/30"
                      : "bg-[#1A1A1C] border-[#1E293B]"
                  }`}
                >
                  <span
                    className={`inline-block w-3.5 h-3.5 transform rounded-full transition-transform ${
                      buzzerLoading
                        ? "translate-x-3 bg-blue-400 animate-pulse"
                        : hardware.systemBuzzer === "ACTIVE"
                        ? "translate-x-5.5 bg-amber-400"
                        : "translate-x-1 bg-[#94A3B8]"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Compact Live Audit Logs container */}
          <div className="bg-[#111113] rounded-2xl border border-[#1E293B] overflow-hidden flex flex-col h-[340px]">
            <div className="px-4 py-3 border-b border-[#1E293B] bg-[#161618] flex justify-between items-center shrink-0">
              <span className="font-sans text-[10px] font-semibold text-[#F8FAFC] uppercase tracking-widest">
                Nhật ký Hoạt động
              </span>
              <span className="text-[8px] font-mono text-[#64748B] tracking-widest uppercase">
                Dữ liệu Trực tiếp
              </span>
            </div>
            
            {/* Log list */}
            <div className="overflow-y-auto flex-grow p-3 space-y-2.5">
              {logs.slice(0, 5).map((log) => {
                const isViolation = log.status === "VIOLATION";
                return (
                  <div
                    key={log.id}
                    className={`p-3 bg-[#161618]/30 border-l rounded-r-lg transition-all ${
                      isViolation ? "border-rose-500 bg-rose-500/[0.02]" : "border-[#334155]"
                    }`}
                  >
                    <div className="flex justify-between items-center text-[9px] font-mono text-[#64748B] mb-1">
                      <span>{log.timestamp.split(" ")[1] || log.timestamp}</span>
                      <span className={isViolation ? "text-rose-400" : "text-[#94A3B8]"}>
                        {translateAccessMethod(log.accessMethod).toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-[#E2E8F0] uppercase tracking-wide">
                      {isViolation ? "XÁC THỰC BỊ TỪ CHỐI: KHÔNG KHỚP" : `${log.subjectName}`}
                    </div>
                    <div className="mt-1 text-[9px] font-mono text-[#64748B] flex items-center justify-between">
                      <span>GT-NORTH-01</span>
                      <span>ĐỘ CHÍNH XÁC: {log.confidence}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
