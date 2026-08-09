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
    house_owner: "Chủ sở hữu",
    household_head: "Chủ hộ",
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

// Luu y: scopeType/scopeValues cua RoleAssignment hien chi la snapshot audit
// ghi lai luc cap quyen - khong co cho nao trong code doc lai de tinh scope
// truy cap thuc te. Co che thuc thi thuc su cho "neighborhood" la
// User.neighborhoodId/assignedNeighborhoodIds ket hop
// rbac.neighborhoodScopeFilter/areaScopeFilter.
export const SCOPE_TYPES = [
    "all",
    "cluster",
    "neighborhood",
    "household",
    "complaint",
    "module",
] as const;
export type ScopeType = typeof SCOPE_TYPES[number];

// ---------------------------------------------------------------------------
// Chu so huu (nha so co the thuoc ca nhan hoac to chuc)
// ---------------------------------------------------------------------------
export const OWNER_TYPE = ["user", "organization", "person"] as const;
export type OwnerType = typeof OWNER_TYPE[number];
export const OWNER_TYPE_LABEL: Record<OwnerType, string> = {
    user: "Cá nhân",
    organization: "Tổ chức",
    // Danh tinh duoc khai bao, khong co tai khoan dang nhap - xem models/Person.ts.
    person: "Cá nhân (chưa có tài khoản)",
};

export const ORGANIZATION_TYPE = [
    "cong_ty",
    "hop_tac_xa",
    "co_quan_nha_nuoc",
    "khac",
] as const;
export type OrganizationType = typeof ORGANIZATION_TYPE[number];
export const ORGANIZATION_TYPE_LABEL: Record<OrganizationType, string> = {
    cong_ty: "Công ty",
    hop_tac_xa: "Hợp tác xã",
    co_quan_nha_nuoc: "Cơ quan nhà nước",
    khac: "Khác",
};

// ---------------------------------------------------------------------------
// Quan he so huu nha (House <-> chu nha/to chuc la nhieu-nhieu, xem model
// HouseOwnership) - HouseRecord.ownerId/ownerType chi con la cache cua quan he
// primary_owner dang active, de cac noi doc nhanh (populate) khong phai join.
// ---------------------------------------------------------------------------
export const HOUSE_OWNERSHIP_RELATIONSHIP_TYPES = [
    "primary_owner",
    "co_owner",
    "authorized_manager",
    "legal_representative",
    "contact_person",
] as const;
export type HouseOwnershipRelationshipType =
    typeof HOUSE_OWNERSHIP_RELATIONSHIP_TYPES[number];
export const HOUSE_OWNERSHIP_RELATIONSHIP_TYPE_LABEL: Record<
    HouseOwnershipRelationshipType,
    string
> = {
    primary_owner: "Chủ sở hữu chính",
    co_owner: "Đồng sở hữu",
    authorized_manager: "Người được ủy quyền quản lý",
    legal_representative: "Người đại diện pháp luật",
    contact_person: "Người liên hệ",
};

// Cac quan he duoc coi la "dang thao tac thay chu nha" (duoc phep thao tac
// nhu chu nha that su, nhan thong bao ket qua duyet...) - legal_representative
// va contact_person chi mang tinh thong tin/lien he, khong co quyen thao tac.
export const ACTING_HOUSE_OWNERSHIP_RELATIONSHIP_TYPES: HouseOwnershipRelationshipType[] =
    ["primary_owner", "co_owner", "authorized_manager"];

export const HOUSE_OWNERSHIP_VERIFICATION_STATUS = [
    "waiting_verification",
    "verified",
    "rejected",
] as const;
export type HouseOwnershipVerificationStatus =
    typeof HOUSE_OWNERSHIP_VERIFICATION_STATUS[number];
export const HOUSE_OWNERSHIP_VERIFICATION_STATUS_LABEL: Record<
    HouseOwnershipVerificationStatus,
    string
> = {
    waiting_verification: "Chờ xác thực",
    verified: "Đã xác thực",
    rejected: "Bị từ chối",
};

// ---------------------------------------------------------------------------
// Nha so
// ---------------------------------------------------------------------------
export const HOUSE_RECORD_STATUS = [
    "unverified",
    "pending",
    "verified",
    "denied",
    "needs_update",
    "locked",
] as const;
export type HouseRecordStatus = typeof HOUSE_RECORD_STATUS[number];
export const HOUSE_RECORD_STATUS_LABEL: Record<HouseRecordStatus, string> = {
    unverified: "chưa xác thực",
    pending: "chờ duyệt",
    verified: "đã xác thực",
    denied: "bị từ chối",
    needs_update: "cần cập nhật",
    locked: "đã khóa",
};

// Trang thai vat ly - doc lap voi `status` o tren (do la trang thai HO SO/xac
// thuc, khong phai tinh trang cong trinh thuc te). Tach rieng theo dac ta:
// khong gop "nha dang xay" voi "ho so chua duyet" vao chung mot truong.
export const HOUSE_PHYSICAL_STATUS = [
    "not_handed_over",
    "not_renovated",
    "under_construction",
    "under_renovation",
    "completed",
    "in_use",
    "vacant",
    "damaged",
] as const;
export type HousePhysicalStatus = typeof HOUSE_PHYSICAL_STATUS[number];
export const HOUSE_PHYSICAL_STATUS_LABEL: Record<HousePhysicalStatus, string> = {
    not_handed_over: "Chưa bàn giao",
    not_renovated: "Chưa sửa",
    under_construction: "Đang hoàn thiện",
    under_renovation: "Đang sửa",
    completed: "Đã hoàn thiện",
    in_use: "Đang sử dụng",
    vacant: "Để trống",
    damaged: "Xuống cấp",
};

// Trang thai xac thuc dung chung cho ca House/Household/Business - ba thuc
// the nay co trang thai xac thuc DOC LAP voi nhau (khong con Household/Business
// dung chung mot enum "vong doi" rieng nhu DeclaredRecordStatus truoc day), chi
// phu thuoc nhau mot chieu qua cascade khi House chuyen sang "verified" (xem
// houseRecordService.resolveInitialVerificationStatus va
// transitionHouseRecordStatus). Household dung enum nay truc tiep; Business
// gop ca ket qua duyet giay to (truoc day la BusinessStatus rieng) vao chung
// truong nay - xem businessDocumentService.recomputeBusinessStatus.
export const VERIFICATION_STATUS = [
    "unverified",
    "pending",
    "verified",
    "denied",
    "locked",
] as const;
export type VerificationStatus = typeof VERIFICATION_STATUS[number];
export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
    unverified: "chưa xác thực",
    pending: "chờ duyệt",
    verified: "đã xác thực",
    denied: "bị từ chối",
    locked: "đã khóa",
};

// Trang thai xac thuc cua tung giay to (BusinessDocument) rieng le.
export const BUSINESS_DOCUMENT_STATUS = [
    "pending",
    "approved",
    "rejected",
] as const;
export type BusinessDocumentStatus = typeof BUSINESS_DOCUMENT_STATUS[number];
export const BUSINESS_DOCUMENT_STATUS_LABEL: Record<
    BusinessDocumentStatus,
    string
> = {
    pending: "chờ duyệt",
    approved: "đã duyệt",
    rejected: "bị từ chối, cần bổ sung",
};

// ---------------------------------------------------------------------------
// Don vi su dung cua nha (HouseUsageUnit) - lop bo sung, KHONG thay the
// houseId truc tiep tren Household/Business/Company: mot nha so co the duoc
// chia thanh nhieu don vi (vd tang/phong) cho hoc dan/ho kinh doanh/cong ty su
// dung, xem models/HouseUsageUnit.ts.
// ---------------------------------------------------------------------------
export const HOUSE_USAGE_TYPE = ["household", "business", "company"] as const;
export type HouseUsageType = typeof HOUSE_USAGE_TYPE[number];
export const HOUSE_USAGE_TYPE_LABEL: Record<HouseUsageType, string> = {
    household: "Hộ dân",
    business: "Hộ kinh doanh",
    company: "Công ty",
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
// Yeu cau cong viec (Request) - thay the cac luong "giao viec" rieng le cua
// PCCC/An ninh bang mot model chung, mo rong duoc cho cac loai yeu cau khac
// sau nay chi bang cach them gia tri vao REQUEST_TYPES (+ mot quyen
// "{type}.assign" moi neu can gioi han nguoi co the nhan).
// ---------------------------------------------------------------------------
export const REQUEST_TYPES = ["pccc", "security", "other"] as const;
export type RequestType = typeof REQUEST_TYPES[number];
export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
    pccc: "PCCC",
    security: "An ninh",
    other: "Khác",
};

export const REQUEST_STATUS = [
    "pending",
    "acknowledged",
    "in_progress",
    "needs_info",
    "awaiting_confirmation",
    "resolved",
] as const;
export type RequestStatus = typeof REQUEST_STATUS[number];
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
    pending: "Chưa xử lý",
    acknowledged: "Đã tiếp nhận",
    in_progress: "Đang xử lý",
    needs_info: "Yêu cầu bổ sung",
    awaiting_confirmation: "Chờ xác nhận",
    resolved: "Đã hoàn thành",
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
    "street",
] as const;
export type ImportJobType = typeof IMPORT_JOB_TYPE[number];

export const IMPORT_JOB_STATUS = [
    "awaiting_mapping",
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

/**
 * Token rieng, ngan han (xem signUploadToken/verifyUploadToken trong auth.ts)
 * dung cho luong upload cua openMediaPicker (Zalo Mini App) - client Zalo tu
 * POST file thang den serverUploadUrl, khong qua request() co san nen khong
 * chac chan mang theo header Authorization. Token nay duoc nhung vao query
 * string cua serverUploadUrl thay vi header, va CHI cho phep upload vao dung
 * mot ban ghi (relatedModel/relatedId) da duoc kiem tra quyen truoc do - khac
 * han SessionTokenPayload (dang nhap toan bo, song 30 ngay).
 */
export type UploadTokenPayload = {
    purpose: "upload";
    userId: string;
    relatedModel: "HouseRecord" | "Business" | "BusinessDocument" | "Complaint";
    relatedId: string;
};
