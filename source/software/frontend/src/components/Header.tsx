import React from "react";
import { Activity, Cpu, Settings, Sun, Moon, UserRound } from "lucide-react";
import { HardwareState } from "../types";

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  connectionStatus?: HardwareState["connectionStatus"];
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function Header({ 
  currentTab, 
  setCurrentTab, 
  connectionStatus = "UNKNOWN",
  theme,
  onToggleTheme
}: HeaderProps) {
  const telemetryLabel = connectionStatus === "ONLINE"
    ? "Mạch điều khiển đang trực tuyến"
    : connectionStatus === "OFFLINE"
      ? "Mạch điều khiển đang ngoại tuyến"
      : "Chưa xác định trạng thái mạch điều khiển";
  const telemetryDot = connectionStatus === "ONLINE"
    ? "bg-[#10B981] animate-pulse"
    : connectionStatus === "OFFLINE"
      ? "bg-rose-500"
      : "bg-[#64748B]";

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-[#111113] border-b border-[#1E293B] z-50 flex items-center justify-between px-6 lg:px-8">
      {/* Brand Logo Section */}
      <div className="flex items-center gap-10">
        <h1 
          onClick={() => setCurrentTab("dashboard")}
          className="font-serif text-xs sm:text-sm lg:text-base font-light text-[#F8FAFC] tracking-[0.1em] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all uppercase flex items-center gap-2"
        >
          <span className="hidden md:inline">Hệ thống Kiểm soát Cổng An ninh Thông minh</span>
          <span className="inline md:hidden">Cổng An ninh</span>
          <span className="font-mono font-medium text-[9px] tracking-widest text-[#64748B] bg-[#1A1A1C] px-2 py-0.5 border border-[#1E293B] rounded relative">AIoT</span>
        </h1>
      </div>

      {/* Telemetry Status Controls & Admin profile */}
      <div className="flex items-center gap-4">
        {/* Telemetry icons */}
        <div className="flex items-center gap-1">
          {/* Light/Dark Theme Toggle */}
          <button 
            onClick={onToggleTheme}
            title={theme === "light" ? "Giao diện Tối" : "Giao diện Sáng"}
            className="p-2 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded-lg transition-colors cursor-pointer"
          >
            {theme === "light" ? <Moon className="w-4 h-4 text-[#475569]" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          <div
            title={telemetryLabel}
            className="p-2 text-[#64748B] rounded-lg relative"
          >
            <Activity className="w-4 h-4" />
            <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${telemetryDot}`} />
          </div>
          <div
            title={telemetryLabel}
            className="p-2 text-[#64748B] rounded-lg"
          >
            <Cpu className="w-4 h-4" />
          </div>
          <button 
            title="Cài đặt cấu hình"
            className="p-2 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Generic account marker: no fabricated profile photo. */}
        <div className="w-8 h-8 rounded-full border border-[#334155] bg-[#161618] ml-1 shrink-0 flex items-center justify-center text-[#64748B]">
          <UserRound className="w-4 h-4" aria-label="Tài khoản quản trị" />
        </div>
      </div>
    </header>
  );
}
