import React, { useEffect, useRef, useState } from "react";
import {
  UserPlus,
  Download,
  Search,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Wifi,
  ShieldCheck,
  ScanFace,
  LoaderCircle,
} from "lucide-react";
import { User as UserType } from "../types";

interface RegistrationViewProps {
  users: UserType[];
  onSaveUser: (user: UserType) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  latestRfidScan: { rfidUid: string; receivedAt: string } | null;
  onStartRfidScan: () => Promise<void>;
  faceEnrollment: {
    employeeId: string;
    status: "REQUESTING" | "STARTED" | "PROGRESS" | "SUCCESS" | "FAILED";
    view?: string;
    completedViews: number;
    reason?: string;
  } | null;
  onStartFaceEnrollment: (employeeId: string) => Promise<void>;
}

export default function RegistrationView({
  users,
  onSaveUser,
  onDeleteUser,
  latestRfidScan,
  onStartRfidScan,
  faceEnrollment,
  onStartFaceEnrollment,
}: RegistrationViewProps) {
  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState(`SENT-${Math.floor(Math.random() * 900 + 100)}`);
  const [role, setRole] = useState<UserType["role"]>("General Staff");

  // Scans/Emulations states
  const [rfidUid, setRfidUid] = useState("NOT LINKED");
  const [isScanningRfid, setIsScanningRfid] = useState(false);
  const scanStartedAtRef = useRef(0);
  const [faceIdStatus, setFaceIdStatus] = useState<UserType["faceIdStatus"]>("PENDING");

  // Search and Directory state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;
  const faceEnrollmentActive = Boolean(
    faceEnrollment &&
    ["REQUESTING", "STARTED", "PROGRESS"].includes(faceEnrollment.status),
  );

  // Editing state tracker
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isScanningRfid || !latestRfidScan) return;
    if (Date.parse(latestRfidScan.receivedAt) < scanStartedAtRef.current) return;

    const normalizedUid = latestRfidScan.rfidUid.trim().toUpperCase();
    const duplicate = users.find(
      (user) =>
        user.id !== editingUserId &&
        user.rfidUid.trim().toUpperCase() === normalizedUid,
    );

    if (duplicate) {
      alert(`Thẻ này đã được liên kết với ${duplicate.fullName}.`);
      setRfidUid("NOT LINKED");
    } else {
      setRfidUid(normalizedUid);
    }
    setIsScanningRfid(false);
  }, [editingUserId, isScanningRfid, latestRfidScan, users]);

  useEffect(() => {
    if (!isScanningRfid) return;
    const timeout = window.setTimeout(() => {
      setIsScanningRfid(false);
      setRfidUid("NOT LINKED");
      alert("Không nhận được thẻ trong 30 giây. Hãy thử quét lại.");
    }, 30_000);
    return () => window.clearTimeout(timeout);
  }, [isScanningRfid]);

  // Request one real UID from the ESP32 through the MQTT bridge.
  const handleScanRfid = async () => {
    if (isScanningRfid) return;
    scanStartedAtRef.current = Date.now();
    try {
      await onStartRfidScan();
      setIsScanningRfid(true);
      setRfidUid("SCANNING...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể bắt đầu quét thẻ";
      alert(message);
      setIsScanningRfid(false);
      setRfidUid("NOT LINKED");
    }
  };

  const handleStartFaceEnrollment = async (employeeId: string) => {
    if (faceEnrollmentActive) return;
    try {
      await onStartFaceEnrollment(employeeId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể bắt đầu đăng ký Face ID");
    }
  };

  const enrollmentInstruction = (() => {
    if (!faceEnrollment) return "Nhập tên nhân viên và bấm nút bên dưới để bắt đầu.";
    if (faceEnrollment.status === "REQUESTING") return "Đang gửi lệnh tới camera HFR...";
    if (faceEnrollment.status === "FAILED") {
      return `❌ Đăng ký thất bại: ${faceEnrollment.reason || "Hết thời gian hoặc không thấy mặt"}. Vui lòng thử lại.`;
    }
    if (faceEnrollment.status === "SUCCESS") {
      return "🎉 HOÀN TẤT 100%! Đã lưu 3 góc khuôn mặt vào bộ nhớ flash. Bạn có thể dừng lại.";
    }
    if (faceEnrollment.completedViews === 0) {
      return "📸 BƯỚC 1/3: Nhìn THẲNG vào camera HFR (30-40cm). Đợi đèn flash chớp 3 lần.";
    }
    if (faceEnrollment.completedViews === 1) {
      return "📸 BƯỚC 2/3: Chính diện đã xong! Hãy quay mặt sang TRÁI 15°. Đợi đèn flash chớp 3 lần.";
    }
    if (faceEnrollment.completedViews === 2) {
      return "📸 BƯỚC 3/3: Góc trái đã xong! Hãy quay mặt sang PHẢI 15°. Đợi đèn flash chớp 3 lần.";
    }
    return "Đang ghi dữ liệu nhận diện vào chip flash...";
  })();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      alert("Vui lòng nhập họ và tên hợp lệ.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      alert("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }
    if (isScanningRfid || rfidUid === "SCANNING...") {
      alert("Vui lòng chờ quét thẻ hoàn tất.");
      return;
    }

    const newUser: UserType = {
      id: userId,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
      rfidUid,
      faceIdStatus,
    };

    try {
      await onSaveUser(newUser);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể lưu nhân viên");
      return;
    }

    // Clear form & reset ID
    setFullName("");
    setEmail("");
    setRfidUid("NOT LINKED");
    setFaceIdStatus("PENDING");
    setEditingUserId(null);
    setUserId(`SENT-${Math.floor(Math.random() * 900 + 100)}`);
  };

  const handleEditUser = (user: UserType) => {
    setEditingUserId(user.id);
    setUserId(user.id);
    setFullName(user.fullName);
    setEmail(user.email || "");
    setRole(user.role);
    setRfidUid(user.rfidUid);
    setFaceIdStatus(user.faceIdStatus);
  };

  const handleCancelEdit = () => {
    setFullName("");
    setEmail("");
    setRfidUid("NOT LINKED");
    setFaceIdStatus("PENDING");
    setEditingUserId(null);
    setUserId(`SENT-${Math.floor(Math.random() * 900 + 100)}`);
  };

  // Directory filter & pagination
  const filteredUsers = users.filter(user =>
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.rfidUid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage) || 1;
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

  return (
    <div className="flex flex-col gap-6">
      {/* Upper header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl font-light text-[#F8FAFC] tracking-wide">
            Quản lý Nhân viên
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Đăng ký thông tin an ninh, quản lý vai trò hệ thống và kiểm tra chỉ số truy cập.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={async () => {
              if (confirm("Bạn có chắc chắn muốn XÓA SẠCH toàn bộ khuôn mặt đã lưu trong bộ nhớ Flash của Camera HFR về 0?")) {
                try {
                  const res = await fetch("http://172.20.10.5/clear", { signal: AbortSignal.timeout(3000) }).catch(() => fetch("/api/camera/hfr/clear"));
                  const data = await res.json();
                  alert(data.success ? "🎉 Đã xóa sạch toàn bộ Face ID trên Camera HFR!" : "Lỗi: " + (data.message || data.error));
                } catch {
                  alert("Không thể kết nối trực tiếp tới Camera HFR qua Wi-Fi.");
                }
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl transition-all text-[9px] font-sans uppercase tracking-widest cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa sạch Face ID Camera
          </button>
          <button className="flex items-center gap-2 px-3.5 py-2 border border-[#1E293B] hover:border-[#334155] text-[#64748B] hover:text-[#94A3B8] rounded-xl transition-all text-[9px] font-sans uppercase tracking-widest cursor-pointer">
            <Download className="w-3.5 h-3.5" />
            Xuất dữ liệu
          </button>
        </div>
      </div>

      {/* Bento Layout Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Hand: Registration Forms / modules (cols-4) */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {/* Add New User profile Builder */}
          <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <UserPlus className="w-4.5 h-4.5 text-[#94A3B8]" />
              <h2 className="font-serif text-md font-light text-[#F8FAFC]">
                {editingUserId ? "Chỉnh sửa Tài khoản" : "Đăng ký Nhân viên"}
              </h2>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1.5 tracking-wider">
                  Họ và Tên
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#161618] border border-[#1E293B] text-[#F8FAFC] rounded-xl focus:border-[#334155] px-4 py-2.5 transition-all text-xs outline-none placeholder-[#475569]"
                />
              </div>

              <div>
                <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1.5 tracking-wider">
                  Email nhận thông báo
                </label>
                <input
                  type="email"
                  placeholder="nhanvien@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#161618] border border-[#1E293B] text-[#F8FAFC] rounded-xl focus:border-[#334155] px-4 py-2.5 transition-all text-xs outline-none placeholder-[#475569]"
                />
                <p className="mt-1.5 text-[9px] text-[#475569]">
                  Để trống nếu nhân viên không muốn nhận thông báo qua email.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1.5 tracking-wider">
                    Mã số Nhân viên
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingUserId !== null}
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full bg-[#161618] border border-[#1E293B] text-[#F8FAFC] rounded-xl focus:border-[#334155] px-4 py-2.5 transition-all text-xs outline-none font-mono disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="font-sans text-[9px] text-[#64748B] uppercase block mb-1.5 tracking-wider">
                    Vai trò
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserType["role"])}
                    className="w-full bg-[#161618] border border-[#1E293B] text-[#F8FAFC] rounded-xl focus:border-[#334155] px-3 py-2.5 transition-all text-xs outline-none cursor-pointer"
                  >
                    <option value="Administrator">Quản trị viên</option>
                    <option value="Security Officer">Nhân viên An ninh</option>
                    <option value="Technician">Kỹ thuật viên</option>
                    <option value="General Staff">Nhân viên</option>
                  </select>
                </div>
              </div>
            </form>
          </div>

          {/* RFID scanner module */}
          <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl shadow-xl">
            <h3 className="font-sans text-[9px] text-[#64748B] mb-4 uppercase tracking-widest">
              Thẻ từ Bảo mật RFID
            </h3>
            <div className="flex items-center justify-between p-4 bg-[#161618]/30 border border-dashed border-[#1E293B] rounded-xl gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 flex items-center justify-center rounded-lg bg-[#161618] border border-[#1E293B] shrink-0 ${isScanningRfid ? "scan-pulse border-[#94A3B8] text-[#F8FAFC]" : "text-[#64748B]"}`}>
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#E2E8F0]">
                    {isScanningRfid ? "Đang chờ quét thẻ trên mạch..." : rfidUid === "NOT LINKED" ? "Đang chờ Thẻ..." : "Đã đọc mã Thẻ"}
                  </p>
                  <p className="font-mono text-[9px] text-[#64748B] tracking-wider uppercase mt-0.5">
                    {rfidUid === "NOT LINKED" ? "CHƯA LIÊN KẾT" : rfidUid === "SCANNING..." ? "ĐANG QUÉT..." : rfidUid}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleScanRfid}
                disabled={isScanningRfid}
                className="px-3 py-1.5 bg-[#1A1A1C] hover:bg-[#262629] disabled:opacity-40 text-[#F8FAFC] border border-[#334155] rounded-lg font-sans text-[10px] uppercase tracking-wider transition-all cursor-pointer"
              >
                {isScanningRfid ? "Đang chờ..." : "Quét Thẻ"}
              </button>
            </div>
          </div>

          {/* Face enrollment is initiated from the web and executed on-device. */}
          <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-sans text-[9px] text-[#64748B] uppercase tracking-widest">
                Đăng ký Face ID trên camera
              </h3>
              <span className="font-mono text-[9px] text-[#94A3B8]">
                {faceEnrollment?.completedViews ?? 0}/3 GÓC
              </span>
            </div>
            <div className={`rounded-xl border p-4 text-[10px] leading-5 ${
              faceEnrollment?.status === "FAILED"
                ? "border-rose-500/20 bg-rose-500/5 text-rose-300"
                : faceEnrollment?.status === "SUCCESS"
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                  : "border-sky-500/20 bg-sky-500/5 text-[#94A3B8]"
            }`}>
              <div className="flex items-start gap-3">
                {faceEnrollmentActive ? (
                  <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-300" />
                ) : (
                  <ScanFace className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  {faceEnrollment && (
                    <div className="mb-1 font-mono text-[9px] uppercase tracking-wider">
                      Nhân viên: {faceEnrollment.employeeId}
                    </div>
                  )}
                  <p>{enrollmentInstruction}</p>
                  <p className="mt-2 text-[9px] text-[#64748B]">
                    Flash nháy 3 lần khi một góc được chấp nhận. Ảnh và embedding không được tải lên web.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={!userId.trim() || faceEnrollmentActive}
              onClick={async () => {
                if (!userId.trim()) {
                  alert("Vui lòng nhập Mã số Nhân viên trước khi quét khuôn mặt.");
                  return;
                }
                if (!fullName.trim()) {
                  alert("Vui lòng nhập Họ và Tên trước khi quét khuôn mặt.");
                  return;
                }
                // Nếu là nhân viên mới chưa lưu, tự động lưu trước rồi kích hoạt HFR
                if (!editingUserId) {
                  try {
                    await onSaveUser({
                      id: userId.trim(),
                      fullName: fullName.trim(),
                      email: email.trim(),
                      role,
                      rfidUid,
                      faceIdStatus: "PENDING",
                    });
                    setEditingUserId(userId.trim());
                  } catch (error) {
                    alert(error instanceof Error ? error.message : "Lỗi lưu hồ sơ nhân viên");
                    return;
                  }
                }
                void handleStartFaceEnrollment(userId.trim());
              }}
              className="mt-4 w-full rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 px-4 py-3 text-[10px] font-semibold uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {faceEnrollmentActive
                ? "Camera HFR đang nhận dạng..."
                : faceIdStatus === "ENROLLED"
                  ? "🔄 Đăng ký lại khuôn mặt trên Cam HFR"
                  : "📸 Bắt đầu đăng ký khuôn mặt trên Cam HFR"}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleSaveProfile}
              className="flex-grow py-3.5 bg-[#1A1A1C] hover:bg-[#262629] border border-[#334155] text-[#F8FAFC] rounded-xl font-sans text-[10px] uppercase tracking-widest font-medium transition-all cursor-pointer text-center"
            >
              {editingUserId ? "Cập nhật Hồ sơ" : "Lưu Hồ sơ"}
            </button>
            {editingUserId && (
              <button
                onClick={handleCancelEdit}
                className="px-5 py-3.5 bg-[#161618] hover:bg-[#1A1A1C] border border-[#1E293B] text-[#64748B] hover:text-[#94A3B8] rounded-xl font-sans text-[10px] uppercase tracking-widest font-medium transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
            )}
          </div>
        </div>

        {/* Right Hand: Directory Database (cols-8) */}
        <div className="xl:col-span-8">
          <div className="bg-[#111113] border border-[#1E293B] rounded-2xl shadow-xl overflow-hidden flex flex-col h-full">

            {/* Table top toolbar */}
            <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#1E293B] shrink-0">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4.5 h-4.5 text-[#64748B]" />
                <h2 className="font-serif text-md font-light text-[#F8FAFC] tracking-wider">Danh mục Người dùng</h2>
              </div>

              {/* Filter search bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="Tìm kiếm nhân viên..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-[#161618] border border-[#1E293B] text-[#F8FAFC] rounded-xl text-xs focus:border-[#334155] outline-none placeholder-[#475569]"
                />
              </div>
            </div>

            {/* Table list */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-[#161618] border-b border-[#1E293B]">
                    <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Mã số NV</th>
                    <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Nhân viên</th>
                    <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Vai trò</th>
                    <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest">Mã Thẻ RFID</th>
                    <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest text-center">Face ID (hồ sơ)</th>
                    <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/60">
                  {currentUsers.length > 0 ? (
                    currentUsers.map((user) => {
                      const initials = user.fullName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase();

                      return (
                        <tr key={user.id} className="hover:bg-[#161618]/30 transition-all group">
                          <td className="px-6 py-4 font-mono text-xs font-semibold text-[#94A3B8]">
                            {user.id}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-[#1A1A1C] flex items-center justify-center text-[9px] font-bold text-[#94A3B8] border border-[#334155]">
                                {initials}
                              </div>
                              <div>
                                <span className="block text-xs font-semibold text-[#E2E8F0]">
                                  {user.fullName}
                                </span>
                                {user.email && (
                                  <span className="block mt-0.5 text-[9px] text-[#64748B]">
                                    {user.email}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 rounded text-[9px] font-sans font-medium bg-[#161618] border border-[#1E293B] text-[#64748B] uppercase tracking-wider">
                              {user.role === "Administrator" ? "Quản trị viên" :
                               user.role === "Security Officer" ? "Nhân viên An ninh" :
                               user.role === "Technician" ? "Kỹ thuật viên" : "Nhân viên"}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-[#64748B]">
                            {user.rfidUid === "NOT LINKED" ? "CHƯA LIÊN KẾT" : user.rfidUid}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {user.faceIdStatus === "ENROLLED" ? (
                              <button
                                type="button"
                                onClick={() => alert(`[VECTOR EMBEDDINGS 512D FOR ${user.fullName} (${user.id})]\n\nModel: MobileNet-FastFace (S16 Quantized)\nDimensions: 512 Floats\nFlash Address: ESP32-CAM-HFR /fr Partition\n\n[Sample Vector Array Preview]:\n[-0.0412, 0.1892, 0.0034, -0.1105, 0.0781, 0.2210, -0.0934, 0.1452, -0.0021, 0.3120, -0.1542, 0.0882, ...]`)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-[8px] font-sans font-medium tracking-widest uppercase hover:bg-emerald-900/40 cursor-pointer transition-colors"
                                title="Bấm để xem mảng Vector AI 512D"
                              >
                                ĐÃ KHAI BÁO (512D)
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/20 border border-amber-500/20 text-amber-400 text-[8px] font-sans font-medium tracking-widest uppercase">
                                CHƯA KHAI BÁO
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => void handleStartFaceEnrollment(user.id)}
                                disabled={faceEnrollmentActive}
                                title={user.faceIdStatus === "ENROLLED" ? "Đăng ký lại Face ID" : "Đăng ký Face ID"}
                                className="p-1 text-[#64748B] hover:text-sky-300 hover:bg-[#1A1A1C] disabled:opacity-30 rounded transition-colors cursor-pointer"
                              >
                                <ScanFace className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleEditUser(user)}
                                title="Chỉnh sửa hồ sơ"
                                className="p-1 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Xóa ${user.fullName} khỏi danh mục nhân sự?`)) {
                                    try {
                                      await onDeleteUser(user.id);
                                    } catch (error) {
                                      alert(error instanceof Error ? error.message : "Không thể xóa nhân viên");
                                    }
                                  }
                                }}
                                title="Xóa người dùng"
                                className="p-1 text-[#64748B] hover:text-rose-400 hover:bg-[#1A1A1C] rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-xs text-[#64748B] font-sans">
                        Không tìm thấy nhân viên phù hợp trong cơ sở dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="p-4 bg-[#161618]/30 border-t border-[#1E293B] flex flex-col sm:flex-row justify-between items-center px-6 gap-3 shrink-0">
              <span className="font-sans text-xs text-[#64748B]">
                Hiển thị từ {indexOfFirstUser + 1} đến {Math.min(indexOfLastUser, filteredUsers.length)} trong số {filteredUsers.length} nhân sự đã đăng ký
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#1E293B] hover:bg-[#1A1A1C] text-[#64748B] hover:text-[#94A3B8] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-sans text-[8px] font-semibold text-[#94A3B8] border border-[#334155] bg-[#1A1A1C] px-3 py-1 rounded tracking-widest uppercase">
                  TRANG {currentPage} / {totalPages}
                </span>
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
      </div>
    </div>
  );
}
