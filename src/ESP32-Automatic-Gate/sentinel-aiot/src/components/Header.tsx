import React from "react";
import { Activity, Cpu, Settings, Sun, Moon } from "lucide-react";

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function Header({
  currentTab,
  setCurrentTab,
  theme,
  onToggleTheme
}: HeaderProps) {
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

          <button
            title="Trạng thái kết nối truyền dữ liệu"
            className="p-2 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded-lg transition-colors relative group"
          >
            <Activity className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#10B981] rounded-full animate-ping" />
          </button>
          <button
            title="Trạng thái telemetry ESP32"
            className="p-2 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded-lg transition-colors"
          >
            <Cpu className="w-4 h-4" />
          </button>
          <button
            title="Cài đặt cấu hình"
            className="p-2 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Admin profile thumbnail with elegant simple border */}
        <div className="w-8 h-8 rounded-full border border-[#334155] overflow-hidden ml-1 shrink-0">
          <img
            alt="Cybersecurity Administrator"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBRGHDCy0UzftYA4Of5ZQMbTb8j1yEMSuFQz18xL69TcAn7QLX6nEzqk1rkSbeETOLjWMrIZDxNszA0g9KYyZb5jr2waSEsmCzSqqS5agC8-wgKBEI5vwLFH4hmviK4i0JI-slxq0vhODttDZdyloBwySdTzQlLRX8FI8JdYJ9NMXGsVvYGT6tf0WSlEWSoGzH64u5bP73PVa3jirVbMb8hFkJWYJTvmj9bI_Sqr3iSdws2PCz1Ge3w37im0GhaKM2azZ5oCzxU92A"
            className="w-full h-full object-cover grayscale brightness-90 hover:grayscale-0 transition-all duration-300"
          />
        </div>
      </div>
    </header>
  );
}
