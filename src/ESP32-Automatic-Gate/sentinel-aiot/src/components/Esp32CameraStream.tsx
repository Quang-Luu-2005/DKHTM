import React from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";

interface Esp32CameraStreamProps {
  className?: string;
  compact?: boolean;
}

const RETRY_DELAY_MS = 3000;

export default function Esp32CameraStream({
  className = "",
  compact = false,
}: Esp32CameraStreamProps) {
  const [streamAttempt, setStreamAttempt] = React.useState(0);
  const [state, setState] = React.useState<"connecting" | "online" | "offline">("connecting");
  const retryTimer = React.useRef<number | null>(null);

  const clearRetryTimer = React.useCallback(() => {
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const checkCameraStatus = React.useCallback(async () => {
    clearRetryTimer();
    setState("connecting");
    try {
      const response = await fetch(`/api/camera/status?timestamp=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Camera status HTTP ${response.status}`);
      setStreamAttempt((attempt) => attempt + 1);
      setState("online");
    } catch {
      setState("offline");
      retryTimer.current = window.setTimeout(() => {
        void checkCameraStatus();
      }, RETRY_DELAY_MS);
    }
  }, [clearRetryTimer]);

  React.useEffect(() => {
    void checkCameraStatus();
    return clearRetryTimer;
  }, [checkCameraStatus, clearRetryTimer]);

  const handleError = () => {
    setState("offline");
    clearRetryTimer();
    retryTimer.current = window.setTimeout(() => {
      void checkCameraStatus();
    }, RETRY_DELAY_MS);
  };

  const handleLoad = () => {
    clearRetryTimer();
    setState("online");
  };

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {state === "online" && (
        <img
          key={streamAttempt}
          src={`/api/camera/stream?attempt=${streamAttempt}`}
          alt="Luồng trực tiếp từ ESP32-CAM"
          className="h-full w-full object-cover brightness-90 contrast-[1.05]"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {state !== "online" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#09090B] px-4 text-center">
          {state === "connecting" ? (
            <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
          ) : (
            <Camera className="h-5 w-5 text-rose-400" />
          )}
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#94A3B8]">
            {state === "connecting"
              ? "Đang kết nối ESP32-CAM"
              : `Camera chưa sẵn sàng • thử lại sau ${RETRY_DELAY_MS / 1000}s`}
          </span>
          {state === "offline" && !compact && (
            <button
              type="button"
              onClick={() => void checkCameraStatus()}
              className="mt-1 flex items-center gap-1.5 rounded-md border border-[#334155] bg-[#161618] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-wider text-[#CBD5E1] hover:bg-[#1E293B]"
            >
              <RefreshCw className="h-3 w-3" />
              Kết nối lại ngay
            </button>
          )}
        </div>
      )}
    </div>
  );
}
