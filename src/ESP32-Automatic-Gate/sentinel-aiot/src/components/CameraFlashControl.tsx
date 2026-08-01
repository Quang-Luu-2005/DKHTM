import React from "react";
import { Lightbulb, Loader2 } from "lucide-react";

interface CameraFlashControlProps {
  compact?: boolean;
}

export default function CameraFlashControl({ compact = false }: CameraFlashControlProps) {
  const [enabled, setEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [available, setAvailable] = React.useState(false);

  React.useEffect(() => {
    let disposed = false;
    void fetch(`/api/camera/status?flashStatus=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Camera status HTTP ${response.status}`);
        return response.json() as Promise<{ flash?: boolean }>;
      })
      .then((status) => {
        if (disposed) return;
        setEnabled(Boolean(status.flash));
        setAvailable(true);
      })
      .catch(() => {
        if (!disposed) setAvailable(false);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const toggleFlash = async () => {
    if (loading || !available) return;
    const nextEnabled = !enabled;
    setLoading(true);
    try {
      const response = await fetch("/api/camera/flash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!response.ok) throw new Error(`Camera flash HTTP ${response.status}`);
      const result = await response.json() as { flash?: boolean };
      setEnabled(Boolean(result.flash));
      setAvailable(true);
    } catch (error) {
      setAvailable(false);
      console.error("Không điều khiển được đèn ESP32-CAM:", error);
    } finally {
      setLoading(false);
    }
  };

  const label = !available
    ? "Đèn camera chưa sẵn sàng"
    : enabled ? "Tắt đèn ESP32-CAM" : "Bật đèn ESP32-CAM";

  return (
    <button
      type="button"
      onClick={() => void toggleFlash()}
      disabled={loading || !available}
      title={label}
      aria-label={label}
      className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled
          ? "border-amber-300/70 bg-amber-400/20 text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.3)]"
          : "border-[#334155] bg-black/75 text-[#CBD5E1] hover:bg-[#1A1A1C]"
      } ${compact ? "p-1.5" : "px-3 py-2"}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
      {!compact && (
        <span className="font-mono text-[8px] font-semibold uppercase tracking-wider">
          {enabled ? "Tắt đèn" : "Bật đèn"}
        </span>
      )}
    </button>
  );
}
