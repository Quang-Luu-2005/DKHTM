import React from "react";
import {
  Activity,
  BrainCircuit,
  Camera,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Lock,
  Radio,
  RefreshCw,
  ShieldAlert,
  Unlock,
  WifiOff,
} from "lucide-react";
import type { AuditLog, HardwareState } from "../types";
import { sendGateOverride } from "../services/boardApi";

interface DashboardViewProps {
  hardware: HardwareState;
  mqttConnected: boolean;
  logs: AuditLog[];
}

const statusStyle = {
  online: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  neutral: "border-[#1E293B] bg-[#161618] text-[#94A3B8]",
};

export default function DashboardView({
  hardware,
  mqttConnected,
  logs,
}: DashboardViewProps) {
  const gateOpen = !hardware.servoLocked;
  const recentLogs = logs.slice(0, 6);
  const [streamVersion, setStreamVersion] = React.useState(0);
  const [frameVersion, setFrameVersion] = React.useState(() => Date.now());
  const [streamState, setStreamState] = React.useState<"connecting" | "online" | "offline">("connecting");
  const [overrideLoading, setOverrideLoading] = React.useState<string | null>(null);

  const handleGateCommand = async (action: "open" | "close" | "normal") => {
    try {
      setOverrideLoading(action);
      await sendGateOverride(action);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Gửi lệnh thất bại");
    } finally {
      setOverrideLoading(null);
    }
  };

  React.useEffect(() => {
    setStreamState("connecting");
  }, [streamVersion]);

  React.useEffect(() => {
    if (streamState !== "online") return;
    const frameTimer = window.setInterval(() => setFrameVersion(Date.now()), 500);
    return () => window.clearInterval(frameTimer);
  }, [streamState, streamVersion]);

  const reconnectStream = () => {
    setStreamState("connecting");
    setStreamVersion((version) => version + 1);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#64748B]">
            Node uplink: ESP32_SEC_01 • Cổng chính sảnh
          </p>
          <h2 className="mt-2 font-serif text-3xl font-light tracking-wide text-[#F8FAFC]">
            Giám sát xác thực tại cổng
          </h2>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-[10px] uppercase tracking-widest ${
          mqttConnected ? statusStyle.online : statusStyle.warning
        }`}>
          {mqttConnected ? <Radio className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {mqttConnected ? "HiveMQ đang kết nối" : "Mất kết nối telemetry"}
        </div>
      </section>

      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5">
        <div className="flex items-start gap-3">
          <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-sky-200">
              Nhận diện khuôn mặt chạy trực tiếp trên ESP32-CAM
            </h3>
            <p className="mt-2 max-w-4xl text-xs leading-6 text-[#94A3B8]">
              Camera HFR chỉ gửi kết quả VERIFIED, UNKNOWN hoặc lỗi chất lượng ảnh về ESP32 chính qua ESP-NOW.
              Camera stream riêng cung cấp MJPEG trực tiếp bên dưới; embedding không được truyền lên dashboard.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-[#1E293B] bg-[#111113] shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-light tracking-wide text-[#F8FAFC]">
                Camera stream trực tiếp
              </h3>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-[#64748B]">
                ESP-DL Face Detect • Live JPEG nội bộ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-lg border px-2.5 py-1 font-mono text-[9px] uppercase ${
              streamState === "online"
                ? statusStyle.online
                : streamState === "offline" ? statusStyle.warning : statusStyle.neutral
            }`}>
              {streamState === "online" ? "Đang phát" : streamState === "offline" ? "Mất tín hiệu" : "Đang kết nối"}
            </span>
            <button
              type="button"
              onClick={reconnectStream}
              className="rounded-lg border border-[#334155] p-2 text-[#94A3B8] transition-colors hover:border-sky-500/40 hover:text-sky-300"
              aria-label="Kết nối lại camera stream"
              title="Kết nối lại camera stream"
            >
              <RefreshCw className={`h-4 w-4 ${streamState === "connecting" ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="relative aspect-video min-h-[240px] bg-black">
          <img
            key={streamVersion}
            src={`/api/camera/stream?v=${streamVersion}`}
            alt="Luồng trực tiếp từ camera ESP32-CAM"
            className={`h-full w-full object-contain transition-opacity duration-300 ${streamState === "offline" ? "opacity-0" : "opacity-100"}`}
            onLoad={() => setStreamState("online")}
            onError={() => setStreamState("offline")}
          />
          {streamState !== "online" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              {streamState === "connecting" ? (
                <RefreshCw className="h-7 w-7 animate-spin text-sky-300" />
              ) : (
                <WifiOff className="h-7 w-7 text-amber-300" />
              )}
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#64748B]">
                {streamState === "connecting" ? "Đang nhận khung hình đầu tiên" : "Không kết nối được camera stream"}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={gateOpen ? DoorOpen : DoorClosed}
          label="Trạng thái cổng"
          value={gateOpen ? "Đang mở" : "Đang khóa"}
          tone={gateOpen ? "online" : "neutral"}
        />
        <StatusCard
          icon={Activity}
          label="ESP32 / HiveMQ"
          value={mqttConnected ? "Trực tuyến" : "Cục bộ vẫn hoạt động"}
          tone={mqttConnected ? "online" : "warning"}
        />
        <StatusCard
          icon={BrainCircuit}
          label="Face Recognition"
          value="On-device HFR S16"
          tone="online"
        />
        <StatusCard
          icon={ShieldAlert}
          label="Cảnh báo xác thực"
          value={`${logs.filter((log) => log.status === "AUTH_ALERT").length} sự kiện`}
          tone="neutral"
        />
      </section>

      {/* Manual Gate Controls Section */}
      <section className="rounded-2xl border border-[#1E293B] bg-[#111113] p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg font-light tracking-wide text-[#F8FAFC]">
              Điều khiển cổng thủ công
            </h3>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-[#64748B]">
              Gửi lệnh cưỡng bức tức thời tới ESP32 qua HiveMQ
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={overrideLoading !== null}
              onClick={() => handleGateCommand("open")}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Unlock className="h-4 w-4" />
              {overrideLoading === "open" ? "Đang gửi..." : "Mở cổng"}
            </button>

            <button
              type="button"
              disabled={overrideLoading !== null}
              onClick={() => handleGateCommand("close")}
              className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-rose-300 transition-all hover:bg-rose-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Lock className="h-4 w-4" />
              {overrideLoading === "close" ? "Đang gửi..." : "Khóa cổng"}
            </button>

            <button
              type="button"
              disabled={overrideLoading !== null}
              onClick={() => handleGateCommand("normal")}
              className="flex items-center gap-2 rounded-xl border border-[#334155] bg-[#1A1A1C] px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-[#94A3B8] transition-all hover:border-[#475569] hover:text-[#F8FAFC] active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${overrideLoading === "normal" ? "animate-spin" : ""}`} />
              {overrideLoading === "normal" ? "Đang gửi..." : "Chế độ tự động"}
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#1E293B] bg-[#111113] shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-4">
          <div>
            <h3 className="font-serif text-lg font-light tracking-wide text-[#F8FAFC]">
              Nhật ký gần nhất
            </h3>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-[#64748B]">
              Dữ liệu nhận qua HiveMQ • chỉ giám sát
            </p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        </div>

        {recentLogs.length === 0 ? (
          <div className="px-5 py-12 text-center font-mono text-xs text-[#64748B]">
            Chưa có sự kiện xác thực.
          </div>
        ) : (
          <div className="divide-y divide-[#1E293B]">
            {recentLogs.map((log) => (
              <div key={log.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[140px_1fr_100px_90px_110px] sm:items-center">
                <span className="font-mono text-[10px] text-[#64748B]">{log.timestamp}</span>
                <div>
                  <p className="text-sm text-[#F8FAFC]">{log.subjectName}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[#64748B]">
                    {log.subjectId || log.gateId} • Khớp {log.confidence}
                  </p>
                </div>
                <span className="font-mono text-[10px] uppercase text-[#94A3B8]">{log.accessMethod}</span>
                <span className="font-mono text-[10px] text-sky-400">{log.executionTime || "0.8s"}</span>
                <span className={`w-fit rounded-lg border px-2.5 py-1 font-mono text-[9px] uppercase ${
                  log.status === "ONLINE"
                    ? statusStyle.online
                    : log.status === "AUTH_ALERT"
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      : statusStyle.warning
                }`}>
                  {log.status === "ONLINE" ? "THÀNH CÔNG" : log.status === "AUTH_FAILURE" ? "TỪ CHỐI" : log.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface StatusCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: keyof typeof statusStyle;
}

function StatusCard({ icon: Icon, label, value, tone }: StatusCardProps) {
  return (
    <article className="rounded-2xl border border-[#1E293B] bg-[#111113] p-5 shadow-lg">
      <div className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl border ${statusStyle[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#64748B]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[#F8FAFC]">{value}</p>
    </article>
  );
}
