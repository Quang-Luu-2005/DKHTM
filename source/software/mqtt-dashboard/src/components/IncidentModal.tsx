import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertOctagon, CheckCircle2 } from "lucide-react";
import { SecurityIncident } from "../types";

interface IncidentModalProps {
  isOpen: boolean;
  incident: SecurityIncident;
  onClose: () => void;
  onEscalate: () => void;
  isAutomatedLockActive?: boolean;
}

export default function IncidentModal({
  isOpen,
  incident,
  onClose,
  onEscalate,
  isAutomatedLockActive = false
}: IncidentModalProps) {
  const [escalated, setEscalated] = useState(false);

  const handleEscalateClick = () => {
    setEscalated(true);
    onEscalate();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-2xl bg-[#111113] border border-[#334155] rounded-2xl shadow-2xl overflow-hidden z-10"
          >
            {/* Elegant dark alert header */}
            <div className="bg-[#1A1A1C] border-b border-[#334155] text-[#F8FAFC] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertOctagon className="w-5 h-5 text-rose-500 animate-pulse" />
                <span className="font-serif text-sm font-light text-[#F8FAFC] tracking-wider uppercase">
                  Kích hoạt giao thức xử lý vi phạm
                </span>
              </div>
              <div className="font-mono text-[9px] font-semibold border border-[#1E293B] px-2.5 py-0.5 rounded bg-[#161618] text-[#94A3B8]">
                {incident.id}
              </div>
            </div>

            {/* Main content grid */}
            <div className="p-6 lg:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Image capture Column */}
              <div className="flex flex-col gap-4">
                <div className="relative aspect-square w-full bg-[#0A0A0B] rounded-xl border border-[#1E293B] overflow-hidden">
                  <img
                    alt="Intruder Capture"
                    src={incident.captureImageUrl}
                    className="w-full h-full object-cover grayscale contrast-125 brightness-75"
                  />
                  <div className="absolute inset-0 border border-rose-500/20 pointer-events-none" />
                  <div className="absolute top-3 left-3 px-2 py-0.5 bg-rose-950/40 border border-rose-500/30 text-[8px] font-sans font-semibold uppercase tracking-widest text-rose-400 rounded">
                    Khung_Ghi_Nhận_Vi_Phạm
                  </div>
                </div>

                {/* Event meta values */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#161618] p-3 border border-[#1E293B] rounded-xl flex flex-col justify-center">
                    <span className="font-sans text-[8px] text-[#64748B] uppercase tracking-wider">
                      Thời gian
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#E2E8F0] mt-0.5">
                      {incident.timestamp}
                    </span>
                  </div>
                  <div className="bg-[#161618] p-3 border border-[#1E293B] rounded-xl flex flex-col justify-center">
                    <span className="font-sans text-[8px] text-[#64748B] uppercase tracking-wider">
                      Mã cổng
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#E2E8F0] mt-0.5">
                      {incident.gateId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Text, Status check, and Actions Column */}
              <div className="flex flex-col justify-between h-full gap-6">
                <div className="flex flex-col gap-4">
                  <h4 className="font-sans text-[9px] font-semibold uppercase tracking-widest text-[#64748B]">
                    Chi tiết Nhật ký Vi phạm
                  </h4>
                  <p className="text-xs text-[#94A3B8] leading-relaxed font-sans">
                    {incident.violationDetails}
                  </p>

                  {/* Status checklist */}
                  <div className="flex flex-col gap-2 mt-4 bg-[#161618]/40 p-4 rounded-xl border border-[#1E293B]/60">
                    {isAutomatedLockActive && (
                      <div className="flex items-center gap-3 text-red-400 font-sans text-xs font-bold animate-pulse">
                        <CheckCircle2 className="w-4 h-4 text-red-500 shrink-0" />
                        <span>HỆ THỐNG TỰ ĐỘNG ĐANG KHÓA</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-rose-400/90 font-sans text-xs">
                      <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>ĐÃ KHÓA THANH CHẮN (SERVO)</span>
                    </div>
                    <div className="flex items-center gap-3 text-rose-400/90 font-sans text-xs">
                      <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>CÒI CẢNH BÁO ĐANG PHÁT</span>
                    </div>
                    <div className="flex items-center gap-3 font-sans text-xs text-[#64748B]">
                      <span className={`w-3.5 h-3.5 rounded-full border border-[#1E293B] flex items-center justify-center shrink-0 ${escalated ? "bg-emerald-950/20 border-emerald-500/20" : "bg-[#0A0A0B]"}`}>
                        {escalated && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />}
                      </span>
                      <span>GIAO THỨC ĐỊA PHƯƠNG ({escalated ? "ĐÃ LEO THANG" : "ĐANG CHỜ"})</span>
                    </div>
                  </div>

                  {isAutomatedLockActive && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 font-mono text-[10px] uppercase tracking-wider flex items-center gap-2 mt-1.5 animate-pulse">
                      <AlertOctagon className="w-4.5 h-4.5 text-red-500 shrink-0" />
                      <span>MACRO TỰ ĐỘNG NGĂN CHẶN XÂM NHẬP ĐANG CHẠY</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={onClose}
                    className="w-full py-3.5 bg-[#1A1A1C] hover:bg-[#262629] text-[#F8FAFC] border border-[#334155] rounded-xl text-xs uppercase tracking-widest font-sans font-medium transition-all cursor-pointer text-center"
                  >
                    Xác nhận đã xử lý sự cố
                  </button>
                  <button
                    disabled={escalated}
                    onClick={handleEscalateClick}
                    className={`w-full py-2.5 rounded-xl text-[10px] font-sans uppercase tracking-widest border transition-all cursor-pointer ${
                      escalated
                        ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-400 cursor-not-allowed"
                        : "bg-[#161618] hover:bg-[#1A1A1C] border border-[#1E293B] hover:border-[#334155] text-[#64748B] hover:text-[#94A3B8]"
                    }`}
                  >
                    {escalated ? "Đã gửi yêu cầu leo thang đến Đội ứng phó" : "Yêu cầu Leo thang đến Đội An ninh"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
