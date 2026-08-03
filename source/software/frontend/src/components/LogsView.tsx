import React, { useState } from "react";
import { 
  Download, 
  Calendar, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  Award,
  ShieldAlert,
  User,
  ScanFace,
  CreditCard,
  Sliders
} from "lucide-react";
import { AuditLog } from "../types";

interface LogsViewProps {
  logs: AuditLog[];
}

function parseLogTimestamp(timestamp: string): Date | null {
  const isoLike = timestamp.includes("T") ? timestamp : timestamp.replace(" ", "T");
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function isAccessAttempt(log: AuditLog): boolean {
  return log.accessMethod === "Face ID" || log.accessMethod === "RFID";
}

function percentage(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export default function LogsView({ logs }: LogsViewProps) {
  // Advanced filters state
  const [selectedAuth, setSelectedAuth] = useState("All Methods");
  const [selectedGate, setSelectedGate] = useState("All Gates");
  const [selectedStatus, setSelectedStatus] = useState("All Statuses");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 5;

  // Hover states for the SVG Weekly Traffic Trend line chart
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const handleExport = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const rows = [
      ["Thời gian", "Đối tượng", "Mã đối tượng", "Phương thức", "Cổng", "Trạng thái", "Độ tin cậy"],
      ...filteredLogs.map(log => [
        log.timestamp,
        log.subjectName,
        log.subjectId || "",
        log.accessMethod,
        log.gateId,
        log.status,
        log.confidence
      ])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(quote).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `Sentinel_Audit_Logs_${localDateKey(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const accessLogs = logs.filter(isAccessAttempt);
  const successfulAccessLogs = accessLogs.filter(log => log.status === "ONLINE");
  const faceLogs = accessLogs.filter(log => log.accessMethod === "Face ID");
  const successfulFaceLogs = faceLogs.filter(log => log.status === "ONLINE");
  const rfidLogs = accessLogs.filter(log => log.accessMethod === "RFID");
  const successfulRfidLogs = rfidLogs.filter(log => log.status === "ONLINE");
  const violationLogs = logs.filter(log => log.status === "VIOLATION");
  const faceAcceptanceRate = faceLogs.length
    ? (successfulFaceLogs.length / faceLogs.length) * 100
    : null;
  const rfidAcceptanceRate = rfidLogs.length
    ? (successfulRfidLogs.length / rfidLogs.length) * 100
    : null;
  const successRate = accessLogs.length
    ? (successfulAccessLogs.length / accessLogs.length) * 100
    : 0;
  const violationRate = logs.length ? (violationLogs.length / logs.length) * 100 : 0;
  const faceShare = accessLogs.length ? (faceLogs.length / accessLogs.length) * 100 : 0;
  const rfidShare = accessLogs.length ? (rfidLogs.length / accessLogs.length) * 100 : 0;
  const gateIds = Array.from(new Set(logs.map(log => log.gateId).filter(Boolean))).sort();

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentPeriodStart = new Date(todayStart);
  currentPeriodStart.setDate(currentPeriodStart.getDate() - 6);
  const previousPeriodStart = new Date(todayStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - 13);
  const currentPeriodAccess = accessLogs.filter(log => {
    const occurredAt = parseLogTimestamp(log.timestamp);
    return occurredAt !== null && occurredAt >= currentPeriodStart;
  }).length;
  const previousPeriodAccess = accessLogs.filter(log => {
    const occurredAt = parseLogTimestamp(log.timestamp);
    return occurredAt !== null
      && occurredAt >= previousPeriodStart
      && occurredAt < currentPeriodStart;
  }).length;
  const trafficComparison = previousPeriodAccess > 0
    ? `${currentPeriodAccess >= previousPeriodAccess ? "+" : ""}${Math.round(
        ((currentPeriodAccess - previousPeriodAccess) / previousPeriodAccess) * 100
      )}% so với 7 ngày trước`
    : `${currentPeriodAccess} lượt trong 7 ngày`;

  const dayFormatter = new Intl.DateTimeFormat("vi-VN", { weekday: "short" });
  const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
  const weeklyTrendPoints = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentPeriodStart);
    date.setDate(currentPeriodStart.getDate() + index);
    const key = localDateKey(date);
    const dayLogs = logs.filter(log => {
      const occurredAt = parseLogTimestamp(log.timestamp);
      return occurredAt !== null && localDateKey(occurredAt) === key;
    });
    return {
      key,
      day: dayFormatter.format(date),
      dateLabel: dateFormatter.format(date),
      successful: dayLogs.filter(log => isAccessAttempt(log) && log.status === "ONLINE").length,
      blocked: dayLogs.filter(log => log.status === "VIOLATION").length
    };
  });
  const chartMaximum = Math.max(
    1,
    ...weeklyTrendPoints.flatMap(point => [point.successful, point.blocked])
  );
  const chartX = (index: number) => (index * 700) / 6;
  const chartY = (count: number) => 180 - (count / chartMaximum) * 150;
  const successfulPath = weeklyTrendPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${chartX(index)},${chartY(point.successful)}`)
    .join(" ");
  const blockedPath = weeklyTrendPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${chartX(index)},${chartY(point.blocked)}`)
    .join(" ");

  // Perform advanced filtering
  const filteredLogs = logs.filter(log => {
    const matchesAuth = selectedAuth === "All Methods" || log.accessMethod === selectedAuth;
    const matchesGate = selectedGate === "All Gates" || log.gateId === selectedGate;
    
    let matchesStatus = true;
    if (selectedStatus !== "All Statuses") {
      if (selectedStatus === "Success") matchesStatus = log.status === "ONLINE";
      else if (selectedStatus === "Violation") matchesStatus = log.status === "VIOLATION";
      else if (selectedStatus === "Expired") matchesStatus = log.status === "EXPIRED";
    }
    
    const occurredAt = parseLogTimestamp(log.timestamp);
    const logDate = occurredAt ? localDateKey(occurredAt) : "";
    const matchesDate = (!startDate || logDate >= startDate) && (!endDate || logDate <= endDate);
    
    return matchesAuth && matchesGate && matchesStatus && matchesDate;
  });

  // Pagination bounds
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage) || 1;
  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);

  return (
    <div className="flex flex-col gap-6">
      {/* Header and Action Column */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl font-light text-[#F8FAFC] tracking-wide">
            Nhật ký Hoạt động Hệ thống
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Xem và xuất nhật ký lịch sử dữ liệu ra vào chi tiết trên toàn bộ các cổng.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-[#1A1A1C] hover:bg-[#262629] text-[#F8FAFC] border border-[#334155] px-5 py-3 rounded-xl font-sans text-xs uppercase tracking-widest transition-all cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Xuất báo cáo (CSV/Excel)
        </button>
      </div>

      {/* Analytics Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1: Traffic */}
        <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1A1A1C] border border-[#1E293B] text-[#94A3B8] shrink-0 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-sans text-[#64748B] tracking-wider uppercase">
              {trafficComparison}
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              Tổng lượt xác thực
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              {accessLogs.length.toLocaleString("vi-VN")}
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="h-full bg-[#94A3B8]" style={{ width: `${successRate}%` }} />
          </div>
        </div>

        {/* KPI 2: Face ID Accuracy */}
        <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1A1A1C] border border-[#1E293B] text-[#94A3B8] shrink-0 rounded-xl">
              <Award className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-sans text-[#64748B] tracking-wider uppercase">
              {faceLogs.length} lượt Face ID
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              Tỷ lệ Face ID được chấp nhận
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              {percentage(faceAcceptanceRate)}
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="h-full bg-[#94A3B8]" style={{ width: `${faceAcceptanceRate || 0}%` }} />
          </div>
        </div>

        {/* KPI 3: RFID */}
        <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1A1A1C] border border-[#1E293B] text-[#94A3B8] shrink-0 rounded-xl">
              <CreditCard className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-sans text-[#64748B] tracking-wider uppercase">
              {rfidLogs.length} lượt RFID
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              RFID hợp lệ
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              {successfulRfidLogs.length.toLocaleString("vi-VN")}
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="h-full bg-[#94A3B8]" style={{ width: `${rfidAcceptanceRate || 0}%` }} />
          </div>
        </div>

        {/* KPI 4: Blocked Incidents */}
        <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1A1A1C] border border-[#1E293B] text-rose-400 shrink-0 rounded-xl">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-sans text-[#64748B] tracking-wider uppercase">
              Dữ liệu audit thực
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              Sự cố bị ngăn chặn
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              {violationLogs.length.toLocaleString("vi-VN")}
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="h-full bg-rose-400" style={{ width: `${violationRate}%` }} />
          </div>
        </div>
      </div>

      {/* Analytics Overview Section */}
      <section className="mb-2">
        <h3 className="font-serif text-lg font-light text-[#F8FAFC] mb-4 tracking-wider">
          Tổng quan Phân tích
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Weekly Traffic Trends custom SVG line chart */}
          <div className="lg:col-span-2 bg-[#111113] p-6 rounded-2xl border border-[#1E293B] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <div>
                <h4 className="font-sans text-sm font-semibold text-[#F8FAFC]">Xu hướng 7 ngày gần nhất</h4>
                <p className="text-xs text-[#64748B] mt-0.5">Tổng hợp trực tiếp từ nhật ký truy cập đã lưu</p>
              </div>
              
              {/* Legends */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#94A3B8] rounded-full" />
                  <span className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">Thành công</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#F87171] rounded-full" />
                  <span className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">Bị chặn</span>
                </div>
              </div>
            </div>

            {/* Interactive SVG Chart visualization area */}
            <div className="relative flex-grow h-[220px] chart-grid border-l border-b border-[#1E293B]/50 px-2 select-none mt-4">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 700 200">
                {/* Horizontal reference grid lines */}
                <line x1="0" y1="50" x2="700" y2="50" stroke="#1E293B" strokeOpacity="0.4" strokeDasharray="3 3" />
                <line x1="0" y1="100" x2="700" y2="100" stroke="#1E293B" strokeOpacity="0.4" strokeDasharray="3 3" />
                <line x1="0" y1="150" x2="700" y2="150" stroke="#1E293B" strokeOpacity="0.4" strokeDasharray="3 3" />

                {/* Successful Line Path (Silver Steel) */}
                <path
                  d={successfulPath}
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_4px_rgba(148,163,184,0.15)]"
                />

                {/* Blocked Line Path (dashed coral red) */}
                <path
                  d={blockedPath}
                  fill="none"
                  stroke="#F87171"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.7"
                />

                {/* Vertical guides and hover hot-spots */}
                {weeklyTrendPoints.map((pt, idx) => {
                  const cx = chartX(idx);
                  const successfulY = chartY(pt.successful);
                  const blockedY = chartY(pt.blocked);
                  const isHovered = hoveredPoint === idx;

                  return (
                    <g key={pt.key}>
                      {/* Interactive hover column area */}
                      <rect
                        x={cx - 30}
                        y="0"
                        width="60"
                        height="200"
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(idx)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />

                      {/* Day Grid line */}
                      {isHovered && (
                        <line x1={cx} y1="0" x2={cx} y2="200" stroke="#94A3B8" strokeOpacity="0.15" strokeWidth="1" />
                      )}

                      {/* Point dot */}
                      <circle
                        cx={cx}
                        cy={successfulY}
                        r={isHovered ? 5 : 3.5}
                        fill={isHovered ? "#F8FAFC" : "#94A3B8"}
                        stroke="#111113"
                        strokeWidth={2}
                        className="transition-all duration-150"
                      />
                      <circle
                        cx={cx}
                        cy={blockedY}
                        r={isHovered ? 4.5 : 3}
                        fill="#F87171"
                        stroke="#111113"
                        strokeWidth={2}
                        className="transition-all duration-150"
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Day Labels at bottom */}
              <div className="absolute -bottom-6 left-0 right-0 flex justify-between font-mono text-[9px] text-[#64748B] uppercase font-bold tracking-widest px-1">
                {weeklyTrendPoints.map((pt) => (
                  <span key={pt.key} className="w-12 text-center">{pt.day}</span>
                ))}
              </div>

              {/* Tooltip backed by the selected day's persisted logs. */}
              {hoveredPoint !== null && (
                <div
                  className="absolute z-10 bg-[#161618] p-3 border border-[#334155] rounded-xl shadow-2xl backdrop-blur-md pointer-events-none"
                  style={{
                    left: `${(hoveredPoint * 100) / 6}%`,
                    top: `${(
                      Math.min(
                        chartY(weeklyTrendPoints[hoveredPoint].successful),
                        chartY(weeklyTrendPoints[hoveredPoint].blocked)
                      ) / 200
                    ) * 100}%`,
                    transform: "translate(-50%, -110%)"
                  }}
                >
                  <p className="font-sans text-[8px] text-[#94A3B8] uppercase tracking-widest font-semibold mb-0.5">
                    {weeklyTrendPoints[hoveredPoint].day} · {weeklyTrendPoints[hoveredPoint].dateLabel}
                  </p>
                  <p className="text-xs font-light text-[#F8FAFC] font-serif">
                    {weeklyTrendPoints[hoveredPoint].successful} thành công
                  </p>
                  <p className="text-[9px] text-rose-400 mt-0.5">
                    {weeklyTrendPoints[hoveredPoint].blocked} bị chặn
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Radial distribution donut chart */}
          <div className="bg-[#111113] p-6 rounded-2xl border border-[#1E293B] flex flex-col">
            <div className="mb-6">
              <h4 className="font-sans text-sm font-semibold text-[#F8FAFC]">Phân bổ Xác thực</h4>
              <p className="text-xs text-[#64748B] mt-0.5">Tỷ trọng Face ID và RFID trong nhật ký</p>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center py-4">
              {/* Customized SVG Donut ring */}
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke="#1E293B"
                    strokeWidth="3.2"
                  />
                  {/* Segment 1: Face ID */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke="#94A3B8"
                    strokeWidth="3.2"
                    strokeDasharray={`${faceShare} ${100 - faceShare}`}
                    strokeDashoffset="0"
                  />
                  {/* Segment 2: RFID */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke="#475569"
                    strokeWidth="3.2"
                    strokeDasharray={`${rfidShare} ${100 - rfidShare}`}
                    strokeDashoffset={-faceShare}
                  />
                </svg>

                {/* Inner label */}
                <div className="absolute flex flex-col items-center">
                  <span className="font-serif text-lg font-light text-[#F8FAFC]">{accessLogs.length}</span>
                  <span className="font-sans text-[8px] text-[#64748B] uppercase font-semibold tracking-widest mt-0.5">
                    LƯỢT
                  </span>
                </div>
              </div>

              {/* Legends list */}
              <div className="mt-6 w-full space-y-2 px-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#94A3B8] rounded-full" />
                    <span className="font-sans text-[#E2E8F0]">Nhận diện khuôn mặt</span>
                  </div>
                  <span className="font-mono text-[#64748B]">{percentage(faceShare)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#475569] rounded-full" />
                    <span className="font-sans text-[#E2E8F0]">Thẻ từ RFID</span>
                  </div>
                  <span className="font-mono text-[#64748B]">{percentage(rfidShare)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Advanced Filters block */}
      <div className="bg-[#111113] p-6 rounded-2xl border border-[#1E293B] shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          
          {/* Date range filter */}
          <div className="space-y-1.5">
            <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1 tracking-wider">
              Khoảng thời gian
            </label>
            <div className="flex items-center gap-2 bg-[#161618] border border-[#1E293B] rounded-xl px-4 py-2.5 shadow-inner">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent border-none text-[11px] font-mono text-[#F8FAFC] outline-none w-full min-w-0 p-0 leading-relaxed cursor-pointer"
                title="Start Date"
              />
              <span className="text-[#64748B] font-mono text-xs select-none shrink-0">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent border-none text-[11px] font-mono text-[#F8FAFC] outline-none w-full min-w-0 p-0 leading-relaxed cursor-pointer"
                title="End Date"
              />
              <Calendar className="w-4 h-4 text-[#64748B] shrink-0 ml-1 select-none" />
            </div>
          </div>

          {/* Auth method filter */}
          <div className="space-y-1.5">
            <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1 tracking-wider">
              Phương thức xác thực
            </label>
            <select
              value={selectedAuth}
              onChange={(e) => {
                setSelectedAuth(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#161618] border border-[#1E293B] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] outline-none focus:border-[#334155] cursor-pointer"
            >
              <option value="All Methods">Tất cả phương thức</option>
              <option value="Face ID">Xác thực Khuôn mặt</option>
              <option value="RFID">Thẻ từ RFID</option>
              <option value="Manual Override">Ghi đè thủ công</option>
            </select>
          </div>

          {/* Gate ID filter */}
          <div className="space-y-1.5">
            <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1 tracking-wider">
              Mã cổng
            </label>
            <select
              value={selectedGate}
              onChange={(e) => {
                setSelectedGate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#161618] border border-[#1E293B] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] outline-none focus:border-[#334155] cursor-pointer"
            >
              <option value="All Gates">Tất cả các cổng</option>
              {gateIds.map(gateId => (
                <option key={gateId} value={gateId}>{gateId}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="space-y-1.5">
            <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1 tracking-wider">
              Trạng thái
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#161618] border border-[#1E293B] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] outline-none focus:border-[#334155] cursor-pointer"
            >
              <option value="All Statuses">Tất cả trạng thái</option>
              <option value="Success">Thành công (Online)</option>
              <option value="Violation">Vi phạm</option>
              <option value="Expired">Hết hạn</option>
            </select>
          </div>

          {/* Apply indicator trigger */}
          <button
            onClick={() => setCurrentPage(1)}
            className="w-full bg-[#1A1A1C] hover:bg-[#262629] border border-[#1E293B] hover:border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] px-4 py-3 rounded-xl text-xs font-sans uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Sliders className="w-4 h-4 text-[#94A3B8]" />
            Áp dụng Bộ lọc
          </button>
        </div>
      </div>

      {/* Main logs Data Grid Table */}
      <div className="bg-[#111113] border border-[#1E293B] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[750px]">
            <thead>
              <tr className="bg-[#161618] border-b border-[#1E293B]">
                <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Thời gian</th>
                <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Đối tượng (Mã nhân viên / UID thẻ)</th>
                <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Phương thức xác thực</th>
                <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Cổng truy cập</th>
                <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Trạng thái</th>
                <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Độ chính xác</th>
                <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/60">
              {currentLogs.length > 0 ? (
                currentLogs.map((log) => {
                  const isViolation = log.status === "VIOLATION";
                  const isExpired = log.status === "EXPIRED";

                  return (
                    <tr key={log.id} className="hover:bg-[#161618]/30 transition-all group">
                      <td className="px-6 py-4 font-mono text-xs text-[#E2E8F0]">
                        {log.timestamp}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {log.avatarUrl ? (
                            <div className="w-7 h-7 rounded overflow-hidden border border-[#1E293B]">
                              <img alt={log.subjectName} src={log.avatarUrl} className="w-full h-full object-cover grayscale brightness-95" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded bg-[#161618] border border-[#1E293B] flex items-center justify-center text-[#64748B]">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <span className="text-xs font-semibold text-[#F8FAFC]">
                            {log.subjectName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-[#E2E8F0]">
                          {log.accessMethod === "Face ID" ? (
                            <ScanFace className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                          ) : log.accessMethod === "RFID" ? (
                            <CreditCard className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                          ) : (
                            <Sliders className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                          )}
                          <span>
                            {log.accessMethod === "Face ID" ? "Xác thực Khuôn mặt" :
                             log.accessMethod === "RFID" ? "Thẻ từ RFID" : "Ghi đè thủ công"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-[#64748B]">
                        {log.gateId}
                      </td>
                      <td className="px-6 py-4">
                        {isViolation ? (
                          <span className="px-2 py-0.5 rounded bg-rose-950/20 border border-rose-500/20 text-rose-400 text-[8px] font-sans font-medium tracking-widest uppercase">
                            Thất bại (Vi phạm)
                          </span>
                        ) : isExpired ? (
                          <span className="px-2 py-0.5 rounded bg-[#161618] border border-[#1E293B] text-[#64748B] text-[8px] font-sans font-medium tracking-widest uppercase">
                            Hết hạn
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-[8px] font-sans font-medium tracking-widest uppercase">
                            Thành công
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-[#94A3B8]">
                        {log.confidence}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-1 text-[#64748B] hover:text-[#F8FAFC] rounded transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-xs text-[#64748B] font-sans">
                    Không có nhật ký lịch sử nào khớp với bộ lọc đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginated Footer */}
        <div className="p-4 bg-[#161618]/30 border-t border-[#1E293B] flex flex-col sm:flex-row justify-between items-center px-6 gap-3 shrink-0">
          <span className="font-sans text-xs text-[#64748B]">
            Hiển thị từ {filteredLogs.length === 0 ? 0 : indexOfFirstLog + 1} đến {Math.min(indexOfLastLog, filteredLogs.length)} trong số {filteredLogs.length} sự kiện đã ghi nhận
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#1E293B] hover:bg-[#1A1A1C] text-[#64748B] hover:text-[#94A3B8] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            
            {/* Show page index bubbles */}
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pNum = idx + 1;
              const isCurrent = pNum === currentPage;
              return (
                <button
                  key={pNum}
                  onClick={() => setCurrentPage(pNum)}
                  className={`w-8 h-8 rounded-xl font-sans text-[9px] cursor-pointer transition-all ${
                    isCurrent 
                      ? "bg-[#1A1A1C] border border-[#334155] text-[#94A3B8] font-semibold" 
                      : "border border-[#1E293B] hover:bg-[#1A1A1C] text-[#64748B] hover:text-[#94A3B8]"
                  }`}
                >
                  {pNum}
                </button>
              );
            })}

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#1E293B] hover:bg-[#1A1A1C] text-[#64748B] hover:text-[#94A3B8] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
