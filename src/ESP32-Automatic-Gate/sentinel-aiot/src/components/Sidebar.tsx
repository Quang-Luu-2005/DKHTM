import React from "react";
import { LayoutDashboard, UserPlus, History, LifeBuoy, Settings2, Lock, Unlock } from "lucide-react";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isEmergencyLocked: boolean;
  onToggleEmergencyLock: () => void;
  isAutomatedLockActive?: boolean;
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  isEmergencyLocked,
  onToggleEmergencyLock,
  isAutomatedLockActive = false
}: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Tổng quan hệ thống", icon: LayoutDashboard },
    { id: "registration", label: "Quản lý nhân viên", icon: UserPlus },
    { id: "logs", label: "Nhật ký vận hành", icon: History }
  ];

  const mobileMenuItems = [
    { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { id: "registration", label: "Nhân viên", icon: UserPlus },
    { id: "logs", label: "Nhật ký", icon: History },
    { id: "settings", label: "Cấu hình", icon: Settings2 },
    { id: "support", label: "Hỗ trợ", icon: LifeBuoy }
  ];

  return (
    <>
      {/* Desktop Sidebar Administrative Navigation Rail (Visible on Large Screens) */}
      <aside className="hidden lg:flex flex-col w-64 fixed left-0 top-16 bottom-0 bg-[#111113] border-r border-[#1E293B] py-8 px-4 z-40">
        {/* Primary Sidebar Navigation */}
        <nav className="flex-1 flex flex-col gap-2 mt-4">
          {menuItems.map((item) => {
            const isActive = currentTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl font-sans text-[10px] uppercase tracking-widest transition-all cursor-pointer border ${
                  isActive
                    ? "bg-[#1A1A1C] text-[#F8FAFC] border-[#334155]"
                    : "text-[#64748B] hover:text-[#94A3B8] hover:bg-[#1A1A1C]/50 border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#94A3B8]" : "text-[#64748B]"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer / Emergency Trigger section */}
        <div className="mt-auto pt-6 border-t border-[#1E293B] flex flex-col gap-3">
          <button
            onClick={() => setCurrentTab("support")}
            className="flex items-center gap-4 px-4 py-2.5 font-sans text-[10px] uppercase tracking-widest text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded-xl transition-all cursor-pointer"
          >
            <LifeBuoy className="w-4 h-4" />
            Hỗ trợ
          </button>
          <button
            onClick={() => setCurrentTab("settings")}
            className="flex items-center gap-4 px-4 py-2.5 font-sans text-[10px] uppercase tracking-widest text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded-xl transition-all cursor-pointer"
          >
            <Settings2 className="w-4 h-4" />
            Cài đặt
          </button>

          {/* Emergency Lock Trigger Button */}
          <button
            onClick={onToggleEmergencyLock}
            className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-mono text-[9px] font-bold uppercase tracking-widest transition-all duration-300 active:scale-95 cursor-pointer border ${
              isAutomatedLockActive
                ? "bg-red-600 hover:bg-red-700 border-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-[pulse_0.5s_infinite_alternate]"
                : isEmergencyLocked
                ? "bg-rose-950/40 border-rose-500/50 text-rose-200 shadow-[0_0_15px_rgba(239,68,68,0.1)] animate-pulse"
                : "bg-[#1A1A1C] border-[#1E293B] hover:border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]"
            }`}
          >
            {isEmergencyLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isAutomatedLockActive ? "Mở khóa tự động" : isEmergencyLocked ? "Giải phóng phong tỏa" : "Khóa hệ thống"}
          </button>
        </div>
      </aside>

      {/* Responsive Bottom Navigation Bar (Visible on Mobile and Tablet Screens) */}
      <footer className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#111113] border-t border-[#1E293B] z-50 flex justify-around items-center px-4 shadow-2xl">
        {mobileMenuItems.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                isActive ? "text-[#F8FAFC]" : "text-[#64748B] hover:text-[#94A3B8]"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] uppercase tracking-wider font-mono font-medium">{tab.label}</span>
            </button>
          );
        })}
      </footer>
    </>
  );
}
