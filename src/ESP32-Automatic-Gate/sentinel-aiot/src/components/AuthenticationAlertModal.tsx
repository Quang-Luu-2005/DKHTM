import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AuthenticationAlert } from "../types";

interface AuthenticationAlertModalProps {
  isOpen: boolean;
  alert: AuthenticationAlert;
  onClose: () => void;
}

const methodLabels = {
  FACE: "Khuôn mặt",
  RFID: "Thẻ RFID",
  MIXED: "Khuôn mặt và RFID",
  NONE: "HC-SR04",
};

export default function AuthenticationAlertModal({
  isOpen,
  alert,
  onClose,
}: AuthenticationAlertModalProps) {
  const isForcedLockPresence = alert.alertType === "PRESENCE_DETECTED_DURING_FORCED_LOCK";
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-amber-500/30 bg-[#111113] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#334155] bg-[#1A1A1C] px-6 py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 animate-pulse text-amber-400" />
                <span className="font-serif text-sm uppercase tracking-wider text-[#F8FAFC]">
                  {isForcedLockPresence ? "Cảnh báo vùng khóa cưỡng bức" : "Cảnh báo xác thực"}
                </span>
              </div>
              <span className="rounded border border-[#334155] px-2.5 py-1 font-mono text-[9px] text-[#94A3B8]">
                {alert.id}
              </span>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[#1E293B] bg-[#161618] p-3">
                  <div className="text-[9px] uppercase tracking-wider text-[#64748B]">Thời gian</div>
                  <div className="mt-1 font-mono text-[#E2E8F0]">{alert.timestamp}</div>
                </div>
                <div className="rounded-xl border border-[#1E293B] bg-[#161618] p-3">
                  <div className="text-[9px] uppercase tracking-wider text-[#64748B]">Mã cổng</div>
                  <div className="mt-1 font-mono text-[#E2E8F0]">{alert.gateId}</div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-[#1E293B] bg-[#161618]/50 p-4 text-xs text-[#CBD5E1]">
                <div className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-amber-400" />Nguồn phát hiện: {methodLabels[alert.authMethod]}</div>
                {isForcedLockPresence ? (
                  <div className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-amber-400" />Có người hoặc vật thể trong vùng cảm biến</div>
                ) : (
                  <div className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-amber-400" />Số lần thất bại: {alert.failedAttempts}</div>
                )}
                <div className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-amber-400" />Trạng thái cổng: Đang khóa</div>
              </div>

              <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs leading-relaxed text-[#94A3B8]">
                {isForcedLockPresence
                  ? "Cổng vẫn được giữ khóa. Cảnh báo sẽ được kích hoạt lại sau khi vùng cảm biến trống rồi có người tới gần lần nữa."
                  : "Đây là cảnh báo xác thực bất thường, không phải xác nhận có hành vi vượt cổng."}
              </p>

              <button
                onClick={onClose}
                className="w-full rounded-xl border border-[#334155] bg-[#1A1A1C] py-3 text-xs uppercase tracking-widest text-[#F8FAFC] transition-colors hover:bg-[#262629]"
              >
                Đã xem cảnh báo
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
