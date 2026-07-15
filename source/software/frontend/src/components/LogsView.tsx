import React, { useState } from "react";
import { 
  Download, 
  Calendar, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  Award,
  Zap,
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

export default function LogsView({ logs }: LogsViewProps) {
  // Advanced filters state
  const [selectedAuth, setSelectedAuth] = useState("All Methods");
  const [selectedGate, setSelectedGate] = useState("All Gates");
  const [selectedStatus, setSelectedStatus] = useState("All Statuses");
  const [startDate, setStartDate] = useState("2026-06-20");
  const [endDate, setEndDate] = useState("2026-06-27");

  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 5;

  // Hover states for the SVG Weekly Traffic Trend line chart
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const handleExport = () => {
    alert("Đang biên dịch cơ sở dữ liệu telemetry lịch sử...\nĐang tạo báo cáo: Sentinel_Audit_Logs_Jun2026.csv\nTải xuống sẽ tự động bắt đầu dưới nền trình duyệt.");
  };

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
    
    const logDate = log.timestamp.split(" ")[0]; // "YYYY-MM-DD"
    const matchesDate = (!startDate || logDate >= startDate) && (!endDate || logDate <= endDate);
    
    return matchesAuth && matchesGate && matchesStatus && matchesDate;
  });

  // Pagination bounds
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage) || 1;
  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);

  // Weekly traffic mockup data points (representing the SVG chart path)
  const weeklyTrendPoints = [
    { day: "MON", value: 160, display: "4.8k" },
    { day: "TUE", value: 120, display: "5.1k" },
    { day: "WED", value: 140, display: "4.9k" },
    { day: "THU", value: 100, display: "5.5k" },
    { day: "FRI", value: 110, display: "5.8k" },
    { day: "SAT", value: 60, display: "6.2k" },
    { day: "SUN", value: 50, display: "6.0k" }
  ];

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
              +12% so với tuần trước
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              Tổng lượt ra vào
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              42.894
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="w-3/4 h-full bg-[#94A3B8]" />
          </div>
        </div>

        {/* KPI 2: Face ID Accuracy */}
        <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1A1A1C] border border-[#1E293B] text-[#94A3B8] shrink-0 rounded-xl">
              <Award className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-sans text-[#64748B] tracking-wider uppercase">
              Hiệu chỉnh ổn định
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              Độ chính xác sinh trắc học
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              99.4%
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="w-5/6 h-full bg-[#94A3B8]" />
          </div>
        </div>

        {/* KPI 3: Latency */}
        <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1A1A1C] border border-[#1E293B] text-[#94A3B8] shrink-0 rounded-xl">
              <Zap className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-sans text-[#64748B] tracking-wider uppercase">
              -4ms Tối ưu hóa
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              Độ trễ truy cập
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              142ms
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="w-2/3 h-full bg-[#94A3B8]" />
          </div>
        </div>

        {/* KPI 4: Blocked Incidents */}
        <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl flex flex-col justify-between hover:border-[#334155] transition-colors group">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-[#1A1A1C] border border-[#1E293B] text-rose-400 shrink-0 rounded-xl">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-sans text-[#64748B] tracking-wider uppercase">
              +2 Đánh dấu
            </span>
          </div>
          <div>
            <p className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
              Sự cố bị ngăn chặn
            </p>
            <h3 className="text-2xl font-serif font-light text-[#F8FAFC] mt-2">
              {logs.filter(l => l.status === "VIOLATION").length * 3}
            </h3>
          </div>
          <div className="h-1.5 mt-4 w-full opacity-30 group-hover:opacity-60 transition-opacity bg-[#161618] rounded-full overflow-hidden">
            <div className="w-1/3 h-full bg-rose-400" />
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
                <h4 className="font-sans text-sm font-semibold text-[#F8FAFC]">Xu hướng Ra vào Hàng tuần</h4>
                <p className="text-xs text-[#64748B] mt-0.5">Phân tích so sánh các lượt truy cập cổng</p>
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
                  d="M0,160 L100,120 L200,140 L300,100 L400,110 L500,60 L600,40 L700,50"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_4px_rgba(148,163,184,0.15)]"
                />

                {/* Blocked Line Path (dashed coral red) */}
                <path
                  d="M0,180 L100,175 L200,190 L300,185 L400,170 L500,180 L600,165 L700,175"
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
                  const cx = (idx * 700) / 6;
                  const cy = pt.value;
                  const isHovered = hoveredPoint === idx;

                  return (
                    <g key={pt.day}>
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
                        cy={cy}
                        r={isHovered ? 5 : 3.5}
                        fill={isHovered ? "#F8FAFC" : "#94A3B8"}
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
                  <span key={pt.day} className="w-12 text-center">{pt.day}</span>
                ))}
              </div>

              {/* Simulated chart hover tooltip */}
              {hoveredPoint !== null && (
                <div
                  className="absolute z-10 bg-[#161618] p-3 border border-[#334155] rounded-xl shadow-2xl backdrop-blur-md pointer-events-none"
                  style={{
                    left: `${(hoveredPoint * 100) / 6}%`,
                    transform: "translateX(-50%)",
                    bottom: `${220 - weeklyTrendPoints[hoveredPoint].value + 15}px`
                  }}
                >
                  <p className="font-sans text-[8px] text-[#94A3B8] uppercase tracking-widest font-semibold mb-0.5">
                    {weeklyTrendPoints[hoveredPoint].day} - CHỈ SỐ AN NINH
                  </p>
                  <p className="text-xs font-light text-[#F8FAFC] font-serif">
                    {weeklyTrendPoints[hoveredPoint].display} Lượt truy cập
                  </p>
                  <p className="text-[9px] text-[#64748B] mt-0.5">Tỷ lệ Telemetry: 99.4%</p>
                </div>
              )}
            </div>
          </div>

          {/* Radial distribution donut chart */}
          <div className="bg-[#111113] p-6 rounded-2xl border border-[#1E293B] flex flex-col">
            <div className="mb-6">
              <h4 className="font-sans text-sm font-semibold text-[#F8FAFC]">Phân bổ Xác thực</h4>
              <p className="text-xs text-[#64748B] mt-0.5">Phương thức ưa chuộng trên các cổng</p>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center py-4">
              {/* Customized SVG Donut ring */}
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {/* Segment 1: Face ID (70%) - Silver Steel */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke="#94A3B8"
                    strokeWidth="3.2"
                    strokeDasharray="70 30"
                    strokeDashoffset="100"
                  />
                  {/* Segment 2: RFID (30%) - Graphite Slate */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke="#475569"
                    strokeWidth="3.2"
                    strokeDasharray="30 70"
                    strokeDashoffset="30"
                  />
                </svg>

                {/* Inner label */}
                <div className="absolute flex flex-col items-center">
                  <span className="font-serif text-lg font-light text-[#F8FAFC]">100%</span>
                  <span className="font-sans text-[8px] text-[#64748B] uppercase font-semibold tracking-widest mt-0.5">
                    CHỈ SỐ
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
                  <span className="font-mono text-[#64748B]">70%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#475569] rounded-full" />
                    <span className="font-sans text-[#E2E8F0]">Thẻ từ RFID</span>
                  </div>
                  <span className="font-mono text-[#64748B]">30%</span>
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
              <option value="GT-NORTH-01">GT-NORTH-01</option>
              <option value="GT-SOUTH-04">GT-SOUTH-04</option>
              <option value="LAB-SEC-09">LAB-SEC-09</option>
              <option value="GT-MAIN-00">GT-MAIN-00</option>
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
            Hiển thị từ {indexOfFirstLog + 1} đến {Math.min(indexOfLastLog, filteredLogs.length)} trong số {filteredLogs.length} sự kiện đã ghi nhận
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
