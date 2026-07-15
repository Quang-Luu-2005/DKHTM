import React, { useState } from "react";
import { 
  UserPlus, 
  Upload, 
  Download, 
  Search, 
  Trash2, 
  Edit2, 
  ChevronLeft, 
  ChevronRight, 
  Camera, 
  Wifi, 
  ShieldCheck,
  User,
  Image
} from "lucide-react";
import { User as UserType } from "../types";

interface RegistrationViewProps {
  users: UserType[];
  onSaveUser: (user: UserType) => void;
  onDeleteUser: (id: string) => void;
}

export default function RegistrationView({
  users,
  onSaveUser,
  onDeleteUser
}: RegistrationViewProps) {
  // Form states
  const [fullName, setFullName] = useState("");
  const [userId, setUserId] = useState(`SENT-${Math.floor(Math.random() * 900 + 100)}`);
  const [role, setRole] = useState<UserType["role"]>("General Staff");
  
  // Scans/Emulations states
  const [rfidUid, setRfidUid] = useState("NOT LINKED");
  const [isScanningRfid, setIsScanningRfid] = useState(false);
  const [faceIdStatus, setFaceIdStatus] = useState<UserType["faceIdStatus"]>("PENDING");
  
  // Drag and drop / portrait upload states
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Search and Directory state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 4;

  // Editing state tracker
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // RFID emulation trigger
  const handleScanRfid = () => {
    if (isScanningRfid) return;
    setIsScanningRfid(true);
    setRfidUid("SCANNING...");

    setTimeout(() => {
      const hexVals = "0123456789ABCDEF";
      let generatedUid = "";
      for (let i = 0; i < 5; i++) {
        generatedUid += hexVals[Math.floor(Math.random() * 16)] + hexVals[Math.floor(Math.random() * 16)];
        if (i < 4) generatedUid += ":";
      }
      setRfidUid(generatedUid);
      setIsScanningRfid(false);
    }, 1500);
  };

  // Drag & drop file handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Vui lòng tải lên tệp hình ảnh (JPG hoặc PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setAvatarUrl(e.target.result as string);
        setFaceIdStatus("ENROLLED");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setAvatarUrl(undefined);
    setFaceIdStatus("PENDING");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      alert("Vui lòng nhập họ và tên hợp lệ.");
      return;
    }

    const newUser: UserType = {
      id: userId,
      fullName: fullName.trim(),
      role,
      rfidUid,
      faceIdStatus,
      avatarUrl
    };

    onSaveUser(newUser);

    // Clear form & reset ID
    setFullName("");
    setRfidUid("NOT LINKED");
    setFaceIdStatus("PENDING");
    setAvatarUrl(undefined);
    setEditingUserId(null);
    setUserId(`SENT-${Math.floor(Math.random() * 900 + 100)}`);
  };

  const handleEditUser = (user: UserType) => {
    setEditingUserId(user.id);
    setUserId(user.id);
    setFullName(user.fullName);
    setRole(user.role);
    setRfidUid(user.rfidUid);
    setFaceIdStatus(user.faceIdStatus);
    setAvatarUrl(user.avatarUrl);
  };

  const handleCancelEdit = () => {
    setFullName("");
    setRfidUid("NOT LINKED");
    setFaceIdStatus("PENDING");
    setAvatarUrl(undefined);
    setEditingUserId(null);
    setUserId(`SENT-${Math.floor(Math.random() * 900 + 100)}`);
  };

  // Directory filter & pagination
  const filteredUsers = users.filter(user =>
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
          <button className="flex items-center gap-2 px-3.5 py-2 border border-[#1E293B] hover:border-[#334155] text-[#64748B] hover:text-[#94A3B8] rounded-xl transition-all text-[9px] font-sans uppercase tracking-widest cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Nhập dữ liệu
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
                    {isScanningRfid ? "Đang quét chip..." : rfidUid === "NOT LINKED" ? "Đang chờ Thẻ..." : "Đã xác thực Thẻ"}
                  </p>
                  <p className="font-mono text-[9px] text-[#64748B] tracking-wider uppercase mt-0.5">
                    {rfidUid === "NOT LINKED" ? "CHƯA LIÊN KẾT" : rfidUid === "SCANNING..." ? "ĐANG QUÉT..." : rfidUid}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleScanRfid}
                className="px-3 py-1.5 bg-[#1A1A1C] hover:bg-[#262629] text-[#F8FAFC] border border-[#334155] rounded-lg font-sans text-[10px] uppercase tracking-wider transition-all cursor-pointer"
              >
                Quét Thẻ
              </button>
            </div>
          </div>

          {/* Face ID Portrait Upload module */}
          <div className="bg-[#111113] p-6 border border-[#1E293B] rounded-2xl shadow-xl">
            <h3 className="font-sans text-[9px] text-[#64748B] mb-4 uppercase tracking-widest">
              Đăng ký Sinh trắc học
            </h3>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {!avatarUrl ? (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-dashed border-2 ${
                  dragActive ? "border-blue-500 bg-slate-800/40" : "border-slate-700 bg-slate-800/20"
                } rounded-2xl hover:bg-slate-800/50 p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center`}
              >
                <div className="w-12 h-12 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 mb-3 border border-slate-700/50">
                  <User className="w-6 h-6 text-slate-400" />
                </div>
                
                <p className="font-sans text-xs font-semibold text-[#F8FAFC]">
                  Tải ảnh chụp chính diện
                </p>
                <p className="font-sans text-[10px] text-slate-400 mt-1">
                  (Upload Straight-on Portrait)
                </p>
                
                <p className="font-sans text-[9px] leading-relaxed text-[#64748B] mt-4 max-w-[220px] mx-auto">
                  Đảm bảo khuôn mặt ở giữa, rõ nét, đủ sáng và nhìn thẳng. Không đeo kính râm hoặc đội mũ. Hỗ trợ JPG hoặc PNG.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-4 bg-[#161618]/20 border border-[#1E293B] rounded-2xl">
                <div className="relative w-full aspect-square max-w-[200px] rounded-full overflow-hidden border border-slate-700 bg-slate-900 flex items-center justify-center">
                  <img
                    src={avatarUrl}
                    alt="Biometric portrait preview"
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Circular biometric framing mask grid overlay */}
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-blue-500/40 pointer-events-none animate-[spin_120s_linear_infinite]" />
                  <div className="absolute inset-4 rounded-full border border-dashed border-emerald-500/30 pointer-events-none" />
                  
                  {/* Crosshair grids */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Horizontal guideline */}
                    <div className="w-full h-[1px] border-t border-dashed border-blue-500/20" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Vertical guideline */}
                    <div className="h-full w-[1px] border-l border-dashed border-blue-500/20" />
                  </div>
                  
                  {/* Circular central head guide target outline */}
                  <div className="absolute w-28 h-36 rounded-[50%/60%] border-2 border-emerald-500/40 pointer-events-none flex items-center justify-center">
                    <span className="text-[7px] font-mono font-bold tracking-widest text-emerald-400/60 uppercase">
                      CĂN CHỈNH MẶT
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="mt-4 px-3.5 py-1.5 rounded-lg text-[9px] font-mono uppercase tracking-wider text-rose-400 hover:text-rose-300 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 transition-colors cursor-pointer"
                >
                  Xóa và Tải lại
                </button>
              </div>
            )}
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
                    <th className="px-6 py-4 font-sans text-[9px] font-medium text-[#64748B] uppercase tracking-widest text-center">Sinh trắc học</th>
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
                              {user.avatarUrl ? (
                                <div className="w-7 h-7 rounded-full overflow-hidden border border-[#1E293B]">
                                  <img 
                                    alt={user.fullName} 
                                    src={user.avatarUrl} 
                                    className="w-full h-full object-cover grayscale brightness-90" 
                                  />
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-[#1A1A1C] flex items-center justify-center text-[9px] font-bold text-[#94A3B8] border border-[#334155]">
                                  {initials}
                                </div>
                              )}
                              <span className="text-xs font-semibold text-[#E2E8F0]">
                                {user.fullName}
                              </span>
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
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-[8px] font-sans font-medium tracking-widest uppercase">
                                AN TOÀN
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/20 border border-amber-500/20 text-amber-400 text-[8px] font-sans font-medium tracking-widest uppercase">
                                ĐANG CHỜ
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEditUser(user)}
                                title="Chỉnh sửa hồ sơ"
                                className="p-1 text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1A1A1C] rounded transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Xóa ${user.fullName} khỏi danh mục nhân sự?`)) {
                                    onDeleteUser(user.id);
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
