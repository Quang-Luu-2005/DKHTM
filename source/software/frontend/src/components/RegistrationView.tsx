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
  Wifi, 
  ShieldCheck,
  User,
  Loader2
} from "lucide-react";
import { AuditLog, User as UserType, UserSaveRequest } from "../types";

interface RegistrationViewProps {
  users: UserType[];
  logs: AuditLog[];
  onSaveUser: (request: UserSaveRequest) => Promise<UserType>;
  onDeleteUser: (id: string) => void;
}

let fallbackUserIdSequence = 0;

function createUserId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `SENT-${uuid.toUpperCase()}`;

  fallbackUserIdSequence += 1;
  return `SENT-${Date.now().toString(36).toUpperCase()}-${fallbackUserIdSequence.toString(36).toUpperCase()}`;
}

export default function RegistrationView({
  users,
  logs,
  onSaveUser,
  onDeleteUser
}: RegistrationViewProps) {
  // Form states
  const [fullName, setFullName] = useState("");
  const [userId, setUserId] = useState(createUserId);
  const [role, setRole] = useState<UserType["role"]>("General Staff");
  
  // Scans/Emulations states
  const [rfidUid, setRfidUid] = useState("NOT LINKED");
  const [isScanningRfid, setIsScanningRfid] = useState(false);
  const [faceIdStatus, setFaceIdStatus] = useState<UserType["faceIdStatus"]>("PENDING");
  const rfidBaselineId = React.useRef<string | undefined>(undefined);
  const rfidTimeout = React.useRef<number | undefined>(undefined);
  
  // Drag and drop / portrait upload states
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState<string | undefined>(undefined);
  const [originalFaceIdStatus, setOriginalFaceIdStatus] = useState<UserType["faceIdStatus"]>("PENDING");
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // Search and Directory state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 4;

  // Editing state tracker
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Chờ chính UID được controller gửi qua backend/SSE, không tạo UID giả.
  const handleScanRfid = () => {
    if (isScanningRfid) return;
    rfidBaselineId.current = logs.find(log => log.accessMethod === "RFID")?.id;
    setIsScanningRfid(true);
    setRfidUid("SCANNING...");

    if (rfidTimeout.current !== undefined) window.clearTimeout(rfidTimeout.current);
    rfidTimeout.current = window.setTimeout(() => {
      setIsScanningRfid(false);
      setRfidUid("NOT LINKED");
      alert("Chưa nhận được thẻ từ controller. Hãy kiểm tra kết nối và thử quét lại.");
    }, 15000);
  };

  React.useEffect(() => {
    if (!isScanningRfid) return;
    const latest = logs.find(log => log.accessMethod === "RFID");
    const scannedUid = latest?.metadata?.rfidUid;
    if (!latest || latest.id === rfidBaselineId.current || typeof scannedUid !== "string") return;

    if (rfidTimeout.current !== undefined) window.clearTimeout(rfidTimeout.current);
    setRfidUid(scannedUid);
    setIsScanningRfid(false);
  }, [isScanningRfid, logs]);

  React.useEffect(() => () => {
    if (rfidTimeout.current !== undefined) window.clearTimeout(rfidTimeout.current);
  }, []);

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
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setSaveError("Ảnh chân dung phải có định dạng JPG hoặc PNG.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setSaveError("Ảnh chân dung không được lớn hơn 8 MB.");
      return;
    }

    setPortraitFile(file);
    setFaceIdStatus("PENDING");
    setSaveError("");
    setSaveSuccess("");
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setAvatarUrl(e.target.result as string);
      }
    };
    reader.onerror = () => {
      setPortraitFile(null);
      setAvatarUrl(originalAvatarUrl);
      setSaveError("Không thể đọc ảnh đã chọn. Vui lòng thử một ảnh khác.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setPortraitFile(null);
    setAvatarUrl(originalAvatarUrl);
    setFaceIdStatus(originalFaceIdStatus);
    setSaveError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const resetForm = () => {
    setFullName("");
    setRole("General Staff");
    setRfidUid("NOT LINKED");
    setFaceIdStatus("PENDING");
    setAvatarUrl(undefined);
    setOriginalAvatarUrl(undefined);
    setOriginalFaceIdStatus("PENDING");
    setPortraitFile(null);
    setEditingUserId(null);
    setUserId(createUserId());
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!fullName.trim()) {
      setSaveError("Vui lòng nhập họ và tên hợp lệ.");
      return;
    }
    if (rfidUid === "SCANNING...") {
      setSaveError("Hãy chờ quét thẻ hoàn tất trước khi lưu hồ sơ.");
      return;
    }
    if (!editingUserId && !portraitFile) {
      setSaveError("Vui lòng chọn ảnh chân dung để backend phát hiện và đăng ký khuôn mặt.");
      return;
    }

    const newUser: UserType = {
      id: userId,
      fullName: fullName.trim(),
      role,
      rfidUid,
      faceIdStatus,
      avatarUrl: portraitFile ? originalAvatarUrl : avatarUrl
    };

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const saved = await onSaveUser({
        user: newUser,
        portrait: portraitFile || undefined
      });
      resetForm();
      setSaveSuccess(
        portraitFile
          ? `Đã lưu ${saved.fullName} và tạo mẫu nhận diện khuôn mặt thành công.`
          : `Đã cập nhật hồ sơ ${saved.fullName}.`
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Không thể lưu hồ sơ hoặc xử lý khuôn mặt. Vui lòng thử lại."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditUser = (user: UserType) => {
    setEditingUserId(user.id);
    setUserId(user.id);
    setFullName(user.fullName);
    setRole(user.role);
    setRfidUid(user.rfidUid);
    setFaceIdStatus(user.faceIdStatus);
    setAvatarUrl(user.avatarUrl);
    setOriginalAvatarUrl(user.avatarUrl);
    setOriginalFaceIdStatus(user.faceIdStatus);
    setPortraitFile(null);
    setSaveError("");
    setSaveSuccess("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCancelEdit = () => {
    resetForm();
    setSaveError("");
    setSaveSuccess("");
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
              accept="image/jpeg,image/png"
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
                  onClick={() => portraitFile ? handleRemoveImage() : fileInputRef.current?.click()}
                  className="mt-4 px-3.5 py-1.5 rounded-lg text-[9px] font-mono uppercase tracking-wider text-rose-400 hover:text-rose-300 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 transition-colors cursor-pointer"
                >
                  {portraitFile ? "Bỏ ảnh vừa chọn" : "Chọn ảnh khác"}
                </button>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#161618]/40 px-4 py-3">
              <p className={`text-[10px] font-mono ${
                portraitFile ? "text-emerald-400" : "text-[#64748B]"
              }`}>
                {portraitFile
                  ? `Ảnh sẵn sàng xử lý: ${portraitFile.name}`
                  : editingUserId && originalAvatarUrl
                  ? "Giữ nguyên mẫu khuôn mặt hiện tại nếu không chọn ảnh mới."
                  : "Ảnh sẽ được xử lý khi bạn lưu hồ sơ."}
              </p>
              <p className="mt-1 text-[9px] leading-relaxed text-[#64748B]">
                Backend sẽ phát hiện đúng một khuôn mặt, trích xuất embedding và lưu mẫu nhận diện vào cơ sở dữ liệu.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={(event) => void handleSaveProfile(event)}
              disabled={isSaving}
              className="flex-grow py-3.5 bg-[#1A1A1C] hover:bg-[#262629] disabled:opacity-50 disabled:cursor-wait border border-[#334155] text-[#F8FAFC] rounded-xl font-sans text-[10px] uppercase tracking-widest font-medium transition-all cursor-pointer text-center flex items-center justify-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSaving
                ? portraitFile ? "Đang xử lý khuôn mặt..." : "Đang lưu hồ sơ..."
                : editingUserId
                ? portraitFile ? "Cập nhật & xử lý khuôn mặt" : "Cập nhật hồ sơ"
                : "Lưu hồ sơ & tạo mẫu khuôn mặt"}
            </button>
            {editingUserId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-5 py-3.5 bg-[#161618] hover:bg-[#1A1A1C] border border-[#1E293B] text-[#64748B] hover:text-[#94A3B8] rounded-xl font-sans text-[10px] uppercase tracking-widest font-medium transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
            )}
          </div>
          {saveError && (
            <p role="alert" className="text-[10px] font-mono text-rose-400 leading-relaxed">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p role="status" className="text-[10px] font-mono text-emerald-400 leading-relaxed">
              {saveSuccess}
            </p>
          )}
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
