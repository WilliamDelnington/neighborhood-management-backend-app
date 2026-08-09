// Danh sach nay do code so huu: chi lieu chi cac permission key da duoc dang ky
// moi duoc coi la hop le. Admin co the gan cac permission da dang ky cho bat ky
// vai tro nao, nhung khong the tao ra permission key moi tu giao dien - muon mo
// rong permission phai sua o day.

export type PermissionDef = {
    key: string;
    label: string;
};

export type ModulePermissionGroup = {
    key: string;
    label: string;
    permissions: PermissionDef[];
};

export const MODULE_PERMISSION_REGISTRY: ModulePermissionGroup[] = [
    {
        key: "dashboard",
        label: "Bảng điều khiển",
        permissions: [{ key: "dashboard.read", label: "Xem bảng điều khiển" }],
    },
    {
        key: "users",
        label: "Người dùng",
        permissions: [
            { key: "users.read", label: "Xem người dùng" },
            { key: "users.create", label: "Tạo tài khoản chủ hộ" },
            { key: "users.update", label: "Cập nhật người dùng" },
            {
                key: "users.lock",
                label:
                    "Khóa / mở khóa tài khoản chủ nhà (giới hạn theo tổ dân phố phụ trách)",
            },
            { key: "users.assign_roles", label: "Gán / thu hồi vai trò" },
        ],
    },
    {
        key: "roles",
        label: "Vai trò & phân quyền",
        permissions: [
            { key: "roles.read", label: "Xem vai trò" },
            { key: "roles.create", label: "Tạo vai trò" },
            { key: "roles.update", label: "Cập nhật vai trò" },
            { key: "roles.delete", label: "Xóa / lưu trữ vai trò" },
            { key: "roles.manage", label: "Quản trị hệ thống vai trò" },
        ],
    },
    {
        key: "houses",
        label: "Nhà số",
        permissions: [
            { key: "houses.read", label: "Xem nhà số" },
            { key: "houses.create", label: "Tạo nhà số" },
            { key: "houses.update", label: "Cập nhật nhà số" },
            { key: "houses.delete", label: "Xóa nhà số" },
            { key: "houses.verify", label: "Duyệt / từ chối nhà số" },
            { key: "houses.lock", label: "Khóa / mở khóa nhà số" },
        ],
    },
    {
        key: "households",
        label: "Hộ dân",
        permissions: [
            { key: "households.read", label: "Xem hộ dân" },
            { key: "households.create", label: "Tạo hộ dân" },
            { key: "households.update", label: "Cập nhật hộ dân" },
            { key: "households.delete", label: "Xóa hộ dân" },
            { key: "households.verify", label: "Duyệt / từ chối hộ dân" },
        ],
    },
    {
        key: "neighborhoods",
        label: "Tổ dân phố",
        permissions: [
            { key: "neighborhoods.read", label: "Xem tổ dân phố" },
            {
                key: "neighborhoods.manage",
                label: "Quản trị tổ dân phố (tạo, cập nhật, gán tổ trưởng)",
            },
        ],
    },
    {
        key: "streets",
        label: "Đường / phố",
        permissions: [
            { key: "streets.read", label: "Xem đường/phố" },
            {
                key: "streets.manage",
                label: "Quản trị đường/phố (tạo, cập nhật)",
            },
        ],
    },
    {
        key: "businesses",
        label: "Hộ kinh doanh",
        permissions: [
            { key: "businesses.read", label: "Xem hộ kinh doanh" },
            { key: "businesses.create", label: "Tạo hộ kinh doanh" },
            { key: "businesses.update", label: "Cập nhật hộ kinh doanh" },
            { key: "businesses.delete", label: "Xóa hộ kinh doanh" },
            {
                key: "businesses.verify",
                label: "Duyệt / từ chối hộ kinh doanh",
            },
            {
                key: "businesses.lock",
                label: "Khóa / mở khóa hộ kinh doanh",
            },
        ],
    },
    {
        key: "companies",
        label: "Công ty",
        permissions: [
            { key: "companies.read", label: "Xem công ty" },
            { key: "companies.create", label: "Tạo công ty" },
            { key: "companies.update", label: "Cập nhật công ty" },
            { key: "companies.delete", label: "Xóa công ty" },
            { key: "companies.verify", label: "Duyệt / từ chối công ty" },
            { key: "companies.lock", label: "Khóa / mở khóa công ty" },
        ],
    },
    {
        key: "usage_units",
        label: "Đơn vị sử dụng nhà",
        permissions: [
            { key: "usage_units.read", label: "Xem đơn vị sử dụng" },
            { key: "usage_units.create", label: "Tạo đơn vị sử dụng" },
            {
                key: "usage_units.update",
                label: "Cập nhật đơn vị sử dụng",
            },
            { key: "usage_units.delete", label: "Xóa đơn vị sử dụng" },
        ],
    },
    {
        key: "citizens",
        label: "Nhân khẩu",
        permissions: [
            { key: "citizens.read", label: "Xem nhân khẩu" },
            { key: "citizens.create", label: "Tạo nhân khẩu" },
            { key: "citizens.update", label: "Cập nhật nhân khẩu" },
            { key: "citizens.delete", label: "Xóa nhân khẩu" },
        ],
    },
    {
        key: "business_types",
        label: "Loại hình kinh doanh",
        permissions: [
            { key: "business_types.read", label: "Xem loại hình kinh doanh" },
            { key: "business_types.create", label: "Tạo loại hình kinh doanh" },
            {
                key: "business_types.update",
                label: "Cập nhật loại hình kinh doanh",
            },
            { key: "business_types.delete", label: "Xóa loại hình kinh doanh" },
        ],
    },
    {
        key: "organizations",
        label: "Tổ chức (chủ nhà)",
        permissions: [
            { key: "organizations.read", label: "Xem tổ chức" },
            { key: "organizations.create", label: "Tạo tổ chức" },
            { key: "organizations.update", label: "Cập nhật tổ chức" },
        ],
    },
    {
        key: "document_types",
        label: "Danh mục giấy tờ",
        permissions: [
            { key: "document_types.read", label: "Xem danh mục giấy tờ" },
            { key: "document_types.create", label: "Tạo loại giấy tờ" },
            {
                key: "document_types.update",
                label: "Cập nhật loại giấy tờ",
            },
            { key: "document_types.delete", label: "Xóa loại giấy tờ" },
        ],
    },
    {
        key: "complaints",
        label: "Phản ánh",
        permissions: [
            { key: "complaints.read", label: "Xem phản ánh" },
            {
                key: "complaints.read_escalated",
                label: "Xem phản ánh đã chuyển UBND (không giới hạn theo cụm)",
            },
            { key: "complaints.create", label: "Tạo phản ánh" },
            { key: "complaints.read_own", label: "Xem phản ánh của mình" },
            { key: "complaints.assign", label: "Gán người xử lý" },
            { key: "complaints.update_status", label: "Cập nhật trạng thái" },
            { key: "complaints.delete", label: "Xóa phản ánh" },
        ],
    },
    {
        key: "support_tickets",
        label: "Yêu cầu hỗ trợ",
        permissions: [
            { key: "support_tickets.read", label: "Xem yêu cầu hỗ trợ" },
            { key: "support_tickets.create", label: "Tạo yêu cầu hỗ trợ" },
            {
                key: "support_tickets.read_own",
                label: "Xem yêu cầu hỗ trợ của mình",
            },
            {
                key: "support_tickets.update_status",
                label: "Cập nhật trạng thái",
            },
        ],
    },
    {
        key: "pccc",
        label: "PCCC",
        permissions: [
            { key: "pccc.read", label: "Xem PCCC" },
            { key: "pccc.create", label: "Tạo bản ghi PCCC" },
            { key: "pccc.update", label: "Cập nhật PCCC" },
            {
                key: "pccc.assign",
                label: "Đủ điều kiện được chọn làm người phụ trách khi nhận yêu cầu loại PCCC",
            },
        ],
    },
    {
        key: "security",
        label: "An ninh",
        permissions: [
            { key: "security.read", label: "Xem an ninh" },
            { key: "security.create", label: "Tạo bản ghi an ninh" },
            { key: "security.update", label: "Cập nhật an ninh" },
            {
                key: "security.assign",
                label: "Đủ điều kiện được chọn làm người phụ trách khi nhận yêu cầu loại An ninh",
            },
        ],
    },
    {
        key: "residents",
        label: "Hồ sơ cư trú",
        permissions: [
            { key: "residents.read", label: "Xem hồ sơ cư trú" },
            { key: "residents.create", label: "Tạo hồ sơ cư trú" },
            { key: "residents.update", label: "Cập nhật hồ sơ cư trú" },
        ],
    },
    {
        key: "requests",
        label: "Yêu cầu công việc",
        permissions: [
            { key: "requests.create", label: "Tạo / gửi yêu cầu" },
            { key: "requests.read", label: "Xem danh sách yêu cầu đã gửi" },
            { key: "requests.update", label: "Cập nhật / hủy yêu cầu" },
            {
                key: "other.assign",
                label: "Đủ điều kiện được chọn làm người phụ trách khi nhận yêu cầu loại Khác",
            },
        ],
    },
    {
        key: "meetings",
        label: "Cuộc họp",
        permissions: [
            { key: "meetings.read", label: "Xem cuộc họp" },
            { key: "meetings.create", label: "Tạo cuộc họp" },
            { key: "meetings.update", label: "Cập nhật cuộc họp" },
            { key: "meetings.publish", label: "Đăng cuộc họp" },
            { key: "meetings.register", label: "Đăng ký tham dự" },
        ],
    },
    {
        key: "announcements",
        label: "Thông báo",
        permissions: [
            { key: "announcements.read", label: "Xem thông báo" },
            { key: "announcements.create", label: "Tạo thông báo" },
            { key: "announcements.update", label: "Cập nhật thông báo" },
            { key: "announcements.publish", label: "Đăng thông báo" },
        ],
    },
    {
        key: "surveys",
        label: "Khảo sát",
        permissions: [
            { key: "surveys.read", label: "Xem khảo sát" },
            { key: "surveys.create", label: "Tạo khảo sát" },
            { key: "surveys.update", label: "Cập nhật khảo sát" },
            { key: "surveys.publish", label: "Mở / đóng khảo sát" },
            { key: "surveys.respond", label: "Trả lời khảo sát" },
        ],
    },
    {
        key: "finance",
        label: "Tài chính",
        permissions: [
            { key: "finance.read", label: "Xem tài chính" },
            { key: "finance.create", label: "Tạo giao dịch" },
            { key: "finance.update", label: "Cập nhật giao dịch" },
            { key: "finance.approve", label: "Duyệt / hủy giao dịch" },
            { key: "finance.delete", label: "Xóa giao dịch" },
        ],
    },
    {
        key: "reports",
        label: "Báo cáo",
        permissions: [
            { key: "reports.read", label: "Xem báo cáo" },
            { key: "reports.export", label: "Xuất báo cáo" },
        ],
    },
    {
        key: "files",
        label: "Tài liệu, biểu mẫu",
        permissions: [
            { key: "files.read", label: "Xem tài liệu" },
            { key: "files.create", label: "Tải lên tài liệu" },
            { key: "files.update", label: "Cập nhật tài liệu" },
            { key: "files.delete", label: "Xóa tài liệu" },
        ],
    },
    {
        key: "settings",
        label: "Cài đặt",
        permissions: [
            { key: "settings.read", label: "Xem cài đặt" },
            { key: "settings.update", label: "Cập nhật cài đặt" },
        ],
    },
    {
        key: "imports",
        label: "Nhập liệu",
        permissions: [{ key: "imports.manage", label: "Nhập dữ liệu" }],
    },
    {
        key: "exports",
        label: "Xuất liệu",
        permissions: [{ key: "exports.export", label: "Xuất dữ liệu" }],
    },
    {
        key: "notifications",
        label: "Thông báo hệ thống",
        permissions: [{ key: "notifications.read", label: "Xem thông báo hệ thống" }],
    },
    {
        key: "audit",
        label: "Nhật ký hệ thống",
        permissions: [{ key: "audit.read", label: "Xem nhật ký hệ thống" }],
    },
];

export const ALL_PERMISSION_KEYS: string[] = MODULE_PERMISSION_REGISTRY.flatMap(
    module => module.permissions.map(p => p.key),
);

export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries(
    MODULE_PERMISSION_REGISTRY.flatMap(module =>
        module.permissions.map(p => [p.key, p.label]),
    ),
);

export function isValidPermissionKey(key: string): boolean {
    return ALL_PERMISSION_KEYS.includes(key);
}
