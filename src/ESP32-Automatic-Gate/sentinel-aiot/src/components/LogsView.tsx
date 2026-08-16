import React, { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { AuditLog } from "../types";

interface LogsViewProps {
  logs: AuditLog[];
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function LogsView({ logs }: LogsViewProps) {
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesQuery = !normalizedQuery || [
        log.subjectName,
        log.subjectId || "",
        log.gateId,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesMethod = method === "ALL" || log.accessMethod === method;
      const matchesStatus = status === "ALL" || log.status === status;
      return matchesQuery && matchesMethod && matchesStatus;
    });
  }, [logs, method, query, status]);

  const exportCsv = () => {
    const header = ["timestamp", "subject", "subject_id", "method", "gate", "status", "confidence"];
    const rows = filteredLogs.map((log) => [
      log.timestamp,
      log.subjectName,
      log.subjectId || "",
      log.accessMethod,
      log.gateId,
      log.status,
      log.confidence,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinel-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light tracking-wide text-[#F8FAFC]">
            Nhật ký xác thực
          </h1>
          <p className="mt-1 text-xs text-[#64748B]">
            Chỉ hiển thị các sự kiện thực tế nhận từ ESP32 qua HiveMQ.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filteredLogs.length === 0}
          className="flex items-center gap-2 rounded-xl border border-[#334155] bg-[#1A1A1C] px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Xuất CSV
        </button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[#1E293B] bg-[#111113] p-4 md:grid-cols-[1fr_200px_200px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm ID, tên nhân viên hoặc mã cổng"
            className="w-full rounded-xl border border-[#1E293B] bg-[#161618] py-2.5 pl-10 pr-4 text-xs text-[#F8FAFC] outline-none focus:border-[#334155]"
          />
        </label>
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          className="rounded-xl border border-[#1E293B] bg-[#161618] px-3 text-xs text-[#F8FAFC] outline-none"
        >
          <option value="ALL">Tất cả phương thức</option>
          <option value="Face ID">Face ID</option>
          <option value="RFID">RFID</option>
          <option value="Manual Override">Hệ thống</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border border-[#1E293B] bg-[#161618] px-3 text-xs text-[#F8FAFC] outline-none"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="ONLINE">Thành công</option>
          <option value="AUTH_FAILURE">Không hợp lệ</option>
          <option value="AUTH_ALERT">Cảnh báo</option>
          <option value="EXPIRED">Hết hạn</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#111113]">
        <table className="w-full min-w-[820px] text-left">
          <thead className="border-b border-[#1E293B] bg-[#161618]">
            <tr>
              {["Thời gian", "Nhân viên / sự kiện", "Phương thức", "Cổng", "Thời gian xử lý", "Kết quả", "Độ trùng khớp"].map((label) => (
                <th key={label} className="px-5 py-4 font-mono text-[9px] uppercase tracking-widest text-[#64748B]">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B]">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-[#161618]/40">
                <td className="px-5 py-4 font-mono text-[10px] text-[#64748B]">{log.timestamp}</td>
                <td className="px-5 py-4">
                  <p className="text-xs text-[#F8FAFC]">{log.subjectName}</p>
                  {log.subjectId && <p className="mt-1 font-mono text-[9px] text-[#64748B]">{log.subjectId}</p>}
                </td>
                <td className="px-5 py-4 text-xs text-[#94A3B8]">{log.accessMethod}</td>
                <td className="px-5 py-4 font-mono text-[10px] text-[#94A3B8]">{log.gateId}</td>
                <td className="px-5 py-4 font-mono text-[10px] text-sky-400">{log.executionTime || "0.8s"}</td>
                <td className="px-5 py-4">
                  <span className={`rounded-lg border px-2.5 py-1 font-mono text-[9px] ${
                    log.status === "ONLINE"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : log.status === "AUTH_ALERT"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}>
                    {log.status === "ONLINE" ? "THÀNH CÔNG" : log.status === "AUTH_FAILURE" ? "TỪ CHỐI" : log.status}
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-[10px] text-emerald-400">{log.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLogs.length === 0 && (
          <div className="px-5 py-12 text-center font-mono text-xs text-[#64748B]">
            Không có nhật ký phù hợp.
          </div>
        )}
      </div>
    </div>
  );
}
