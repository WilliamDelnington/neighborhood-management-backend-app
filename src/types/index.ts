export type ApiResponse<T = unknown> = {
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
};

export type PaginatedData<T> = {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

// ---------------------------------------------------------------------------
// Vai tro nguoi dung
// ---------------------------------------------------------------------------
// Vai tro gio la du lieu dong (xem model Role), khong con la union TypeScript
// tinh. SYSTEM_ROLE_KEYS chi con dung de seed 6 vai tro he thong mac dinh -
// khong dung lam danh sach day du cac vai tro hop le.
export const SYSTEM_ROLE_KEYS = [
    "house_owner",
    "neighborhood_leader",
    "secretary",
    "regional_police",
    "people_committee_official",
    "admin",
] as const;
export type Role = string;
export type PermissionKey = string;

export const ROLE_LABEL: Record<string, string> = {
    house_owner: "Chủ hộ",
    neighborhood_leader: "Tổ trưởng",
    secretary: "Bí thư",
    regional_police: "Công an khu vực",
    people_committee_official: "Cán bộ UBND",
    admin: "Quản trị viên",
};

export const USER_STATUS = ["active", "pending", "locked"] as const;
export type UserStatus = typeof USER_STATUS[number];
export const USER_STATUS_LABEL: Record<UserStatus, string> = {
    active: "Đang hoạt động",
    pending: "Chờ duyệt",
    locked: "Đã khóa",
};

export const SCOPE_TYPES = [
    "all",
    "cluster",
    "household",
    "complaint",
    "module",
] as const;
export type ScopeType = typeof SCOPE_TYPES[number];

// ---------------------------------------------------------------------------
// Nha so
// ---------------------------------------------------------------------------
export const HOUSE_RECORD_STATUS = [
    "unverified",
    "pending",
    "verified",
    "denied",
    "locked",
] as const;
export type HouseRecordStatus = typeof HOUSE_RECORD_STATUS[number];
export const HOUSE_RECORD_STATUS_LABEL: Record<HouseRecordStatus, string> = {
    unverified: "chưa xác thực",
    pending: "chờ duyệt",
    verified: "đã xác thực",
    denied: "bị từ chối",
    locked: "đã khóa",
};

// ---------------------------------------------------------------------------
// Ho dan
// ---------------------------------------------------------------------------
export const LOAI_SO_HUU = ["chinh_chu", "cho_thue"] as const;
export type LoaiSoHuu = typeof LOAI_SO_HUU[number];
export const LOAI_SO_HUU_LABEL: Record<LoaiSoHuu, string> = {
    chinh_chu: "Chính chủ",
    cho_thue: "Cho thuê",
};

// ---------------------------------------------------------------------------
// Nhan khau
// ---------------------------------------------------------------------------
export const GIOI_TINH = ["nam", "nu", "khac"] as const;
export type GioiTinh = typeof GIOI_TINH[number];
export const GIOI_TINH_LABEL: Record<GioiTinh, string> = {
    nam: "Nam",
    nu: "Nữ",
    khac: "Khác",
};

export const LOAI_CU_TRU = ["thuong_tru", "tam_tru"] as const;
export type LoaiCuTru = typeof LOAI_CU_TRU[number];
export const LOAI_CU_TRU_LABEL: Record<LoaiCuTru, string> = {
    thuong_tru: "Thường trú",
    tam_tru: "Tạm trú",
};

// ---------------------------------------------------------------------------
// Phan anh kien nghi
// ---------------------------------------------------------------------------
export const NHOM_PHAN_ANH = [
    "an_ninh_trat_tu",
    "pccc",
    "ve_sinh_moi_truong",
    "ha_tang_dien_nuoc",
    "chieu_sang",
    "tranh_chap_dan_cu",
    "tam_tru_nha_cho_thue",
    "gop_y_chung",
    "khac",
] as const;
export type NhomPhanAnh = typeof NHOM_PHAN_ANH[number];
export const NHOM_PHAN_ANH_LABEL: Record<NhomPhanAnh, string> = {
    an_ninh_trat_tu: "An ninh trật tự",
    pccc: "PCCC",
    ve_sinh_moi_truong: "Vệ sinh môi trường",
    ha_tang_dien_nuoc: "Hạ tầng điện nước",
    chieu_sang: "Chiếu sáng",
    tranh_chap_dan_cu: "Tranh chấp dân cư",
    tam_tru_nha_cho_thue: "Tạm trú / nhà cho thuê",
    gop_y_chung: "Góp ý chung",
    khac: "Khác",
};

export const TRANG_THAI_PHAN_ANH = [
    "moi_tiep_nhan",
    "da_tiep_nhan",
    "dang_xu_ly",
    "da_chuyen_ubnd",
    "da_xu_ly",
    "dong",
] as const;
export type TrangThaiPhanAnh = typeof TRANG_THAI_PHAN_ANH[number];
export const TRANG_THAI_PHAN_ANH_LABEL: Record<TrangThaiPhanAnh, string> = {
    moi_tiep_nhan: "Mới tiếp nhận",
    da_tiep_nhan: "Đã tiếp nhận",
    dang_xu_ly: "Đang xử lý",
    da_chuyen_ubnd: "Đã chuyển UBND phường",
    da_xu_ly: "Đã xử lý",
    dong: "Đóng",
};

// ---------------------------------------------------------------------------
// Ho tro (Mini App - Ho so ca nhan)
// ---------------------------------------------------------------------------
export const LOAI_YEU_CAU_HO_TRO = ["bao_loi", "gop_y"] as const;
export type LoaiYeuCauHoTro = typeof LOAI_YEU_CAU_HO_TRO[number];
export const LOAI_YEU_CAU_HO_TRO_LABEL: Record<LoaiYeuCauHoTro, string> = {
    bao_loi: "Báo lỗi",
    gop_y: "Góp ý",
};

export const TRANG_THAI_YEU_CAU_HO_TRO = [
    "moi",
    "dang_xu_ly",
    "da_xu_ly",
    "dong",
] as const;
export type TrangThaiYeuCauHoTro = typeof TRANG_THAI_YEU_CAU_HO_TRO[number];
export const TRANG_THAI_YEU_CAU_HO_TRO_LABEL: Record<
    TrangThaiYeuCauHoTro,
    string
> = {
    moi: "Mới",
    dang_xu_ly: "Đang xử lý",
    da_xu_ly: "Đã xử lý",
    dong: "Đóng",
};

// ---------------------------------------------------------------------------
// PCCC
// ---------------------------------------------------------------------------
export const MUC_NGUY_CO_PCCC = ["xanh", "vang", "do"] as const;
export type MucNguyCoPccc = typeof MUC_NGUY_CO_PCCC[number];
export const MUC_NGUY_CO_PCCC_LABEL: Record<MucNguyCoPccc, string> = {
    xanh: "Xanh",
    vang: "Vàng",
    do: "Đỏ",
};

export const TINH_TRANG_THEO_DOI_PCCC = [
    "chua_khac_phuc",
    "dang_khac_phuc",
    "da_khac_phuc",
] as const;
export type TinhTrangTheoDoiPccc = typeof TINH_TRANG_THEO_DOI_PCCC[number];
export const TINH_TRANG_THEO_DOI_PCCC_LABEL: Record<
    TinhTrangTheoDoiPccc,
    string
> = {
    chua_khac_phuc: "Chưa khắc phục",
    dang_khac_phuc: "Đang khắc phục",
    da_khac_phuc: "Đã khắc phục",
};

// ---------------------------------------------------------------------------
// An ninh / tam tru / nha cho thue
// ---------------------------------------------------------------------------
export const MUC_DO_AN_NINH = [
    "binh_thuong",
    "can_theo_doi",
    "khan_cap",
] as const;
export type MucDoAnNinh = typeof MUC_DO_AN_NINH[number];
export const MUC_DO_AN_NINH_LABEL: Record<MucDoAnNinh, string> = {
    binh_thuong: "Bình thường",
    can_theo_doi: "Cần theo dõi",
    khan_cap: "Khẩn cấp",
};

export const TINH_TRANG_THEO_DOI_AN_NINH = [
    "binh_thuong",
    "dang_theo_doi",
    "da_bao_cong_an",
    "da_ket_thuc",
] as const;
export type TinhTrangTheoDoiAnNinh = typeof TINH_TRANG_THEO_DOI_AN_NINH[number];
export const TINH_TRANG_THEO_DOI_AN_NINH_LABEL: Record<
    TinhTrangTheoDoiAnNinh,
    string
> = {
    binh_thuong: "Bình thường",
    dang_theo_doi: "Đang theo dõi",
    da_bao_cong_an: "Đã báo Công an",
    da_ket_thuc: "Đã kết thúc",
};

// ---------------------------------------------------------------------------
// Cuoc hop
// ---------------------------------------------------------------------------
export const DANG_KY_HOP = ["co", "khong", "uy_quyen"] as const;
export type DangKyHop = typeof DANG_KY_HOP[number];
export const DANG_KY_HOP_LABEL: Record<DangKyHop, string> = {
    co: "Có",
    khong: "Không",
    uy_quyen: "Ủy quyền",
};

// ---------------------------------------------------------------------------
// Thong bao
// ---------------------------------------------------------------------------
export const LOAI_THONG_BAO = [
    "chung",
    "hop_dan",
    "pccc",
    "ve_sinh_moi_truong",
    "an_ninh_trat_tu",
    "khac",
] as const;
export type LoaiThongBao = typeof LOAI_THONG_BAO[number];
export const LOAI_THONG_BAO_LABEL: Record<LoaiThongBao, string> = {
    chung: "Thông báo chung",
    hop_dan: "Họp dân",
    pccc: "PCCC",
    ve_sinh_moi_truong: "Vệ sinh môi trường",
    an_ninh_trat_tu: "An ninh trật tự",
    khac: "Khác",
};

export const TRANG_THAI_THONG_BAO = ["nhap", "da_dang"] as const;
export type TrangThaiThongBao = typeof TRANG_THAI_THONG_BAO[number];
export const TRANG_THAI_THONG_BAO_LABEL: Record<TrangThaiThongBao, string> = {
    nhap: "Nháp",
    da_dang: "Đã đăng",
};

// ---------------------------------------------------------------------------
// Khao sat
// ---------------------------------------------------------------------------
export const LOAI_CAU_HOI_KHAO_SAT = [
    "dong_y_khong_dong_y",
    "chon_mot",
    "chon_nhieu",
    "y_kien_khac",
] as const;
export type LoaiCauHoiKhaoSat = typeof LOAI_CAU_HOI_KHAO_SAT[number];
export const LOAI_CAU_HOI_KHAO_SAT_LABEL: Record<LoaiCauHoiKhaoSat, string> = {
    dong_y_khong_dong_y: "Đồng ý / Không đồng ý",
    chon_mot: "Chọn một",
    chon_nhieu: "Chọn nhiều",
    y_kien_khac: "Ý kiến khác",
};

export const TRANG_THAI_KHAO_SAT = ["nhap", "dang_mo", "da_dong"] as const;
export type TrangThaiKhaoSat = typeof TRANG_THAI_KHAO_SAT[number];
export const TRANG_THAI_KHAO_SAT_LABEL: Record<TrangThaiKhaoSat, string> = {
    nhap: "Nháp",
    dang_mo: "Đang mở",
    da_dong: "Đã đóng",
};

// ---------------------------------------------------------------------------
// Tai chinh
// ---------------------------------------------------------------------------
export const LOAI_GIAO_DICH_TAI_CHINH = ["thu", "chi"] as const;
export type LoaiGiaoDichTaiChinh = typeof LOAI_GIAO_DICH_TAI_CHINH[number];
export const LOAI_GIAO_DICH_TAI_CHINH_LABEL: Record<
    LoaiGiaoDichTaiChinh,
    string
> = {
    thu: "Khoản thu",
    chi: "Khoản chi",
};

export const TRANG_THAI_GIAO_DICH = ["nhap", "da_duyet", "da_huy"] as const;
export type TrangThaiGiaoDich = typeof TRANG_THAI_GIAO_DICH[number];
export const TRANG_THAI_GIAO_DICH_LABEL: Record<TrangThaiGiaoDich, string> = {
    nhap: "Nháp",
    da_duyet: "Đã duyệt",
    da_huy: "Đã hủy",
};

// ---------------------------------------------------------------------------
// Thong bao he thong / Notification
// ---------------------------------------------------------------------------
export const NOTIFICATION_CHANNEL = ["in_app", "zalo_oa_future"] as const;
export type NotificationChannel = typeof NOTIFICATION_CHANNEL[number];

export const NOTIFICATION_STATUS = [
    "draft",
    "queued",
    "sent",
    "failed",
] as const;
export type NotificationStatus = typeof NOTIFICATION_STATUS[number];

// ---------------------------------------------------------------------------
// Import job
// ---------------------------------------------------------------------------
export const IMPORT_JOB_TYPE = [
    "household",
    "citizen",
    "party_member",
] as const;
export type ImportJobType = typeof IMPORT_JOB_TYPE[number];

export const IMPORT_JOB_STATUS = [
    "previewing",
    "validated",
    "committed",
    "failed",
] as const;
export type ImportJobStatus = typeof IMPORT_JOB_STATUS[number];

// ---------------------------------------------------------------------------
// Session token payload (JWT)
// ---------------------------------------------------------------------------
export type SessionTokenPayload = {
    userId: string;
    primaryRole: Role;
    roles: Role[];
    sv: number;
};
