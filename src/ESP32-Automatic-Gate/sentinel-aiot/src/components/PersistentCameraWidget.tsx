import { Maximize2, Radio } from "lucide-react";
import Esp32CameraStream from "./Esp32CameraStream";
import CameraFlashControl from "./CameraFlashControl";

interface PersistentCameraWidgetProps {
  onOpenDashboard: () => void;
}

export default function PersistentCameraWidget({ onOpenDashboard }: PersistentCameraWidgetProps) {
  return (
    <aside className="fixed bottom-20 right-4 z-40 w-64 overflow-hidden rounded-xl border border-[#334155] bg-[#111113] shadow-2xl lg:bottom-5 lg:right-5 lg:w-72">
      <div className="flex items-center justify-between border-b border-[#1E293B] px-3 py-2">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-[#CBD5E1]">
            ESP32-CAM trực tiếp
          </span>
        </div>
        <div className="flex items-center gap-1">
          <CameraFlashControl compact />
          <button
            type="button"
            onClick={onOpenDashboard}
            title="Mở camera lớn tại bảng điều khiển"
            className="rounded p-1 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <Esp32CameraStream compact className="aspect-video w-full" />
    </aside>
  );
}
