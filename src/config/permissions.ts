export type PermissionDef = { key: string; label: string };
export type ModulePermissionGroup = {
    key: string;
    label: string;
    permissions: PermissionDef[];
};

/**
 * Danh muc quyen han theo module, dung cho man hinh "Vai tro & phan quyen" o admin
 * (checkbox theo nhom) va de validate permissions[] khi tao/sua Role. Cac key nay
 * khop voi tung AdminGuard/usePermission dang duoc kiem tra ben admin frontend.
 */
export const PERMISSION_REGISTRY: ModulePermissionGroup[] = [
    {
        key: "dashboard",
        label: "Bảng điều khiển",
        permissions: [{ key: "dashboard.read", label: "Xem bảng điều khiển" }],
    },
    {
        key: "users",
        label: "Người dùng",
        permissions: [
            { key: "users.read", label: "Xem" },
            { key: "users.update", label: "Cập nhật" },
            { key: "users.assign_roles", label: "Gán vai trò" },
        ],
    },
    {
        key: "roles",
        label: "Vai trò & phân quyền",
        permissions: [
            { key: "roles.read", label: "Xem" },
            { key: "roles.create", label: "Tạo mới" },
            { key: "roles.update", label: "Cập nhật" },
            { key: "roles.delete", label: "Xóa" },
            { key: "roles.manage", label: "Toàn quyền quản lý" },
        ],
    },
    {
        key: "households",
        label: "Hộ dân",
        permissions: [
            { key: "households.read", label: "Xem" },
            { key: "households.create", label: "Tạo mới" },
            { key: "households.update", label: "Cập nhật" },
            { key: "households.delete", label: "Xóa" },
        ],
    },
    {
        key: "citizens",
        label: "Nhân khẩu",
        permissions: [
            { key: "citizens.read", label: "Xem" },
            { key: "citizens.create", label: "Tạo mới" },
            { key: "citizens.update", label: "Cập nhật" },
            { key: "citizens.delete", label: "Xóa" },
        ],
    },
    {
        key: "complaints",
        label: "Phản ánh, kiến nghị",
        permissions: [
            { key: "complaints.read", label: "Xem" },
            { key: "complaints.create", label: "Gửi phản ánh" },
            { key: "complaints.read_own", label: "Xem phản ánh của mình" },
            { key: "complaints.assign", label: "Phân công xử lý" },
            { key: "complaints.update_status", label: "Cập nhật trạng thái" },
            { key: "complaints.delete", label: "Xóa" },
        ],
    },
    {
        key: "pccc",
        label: "PCCC",
        permissions: [
            { key: "pccc.read", label: "Xem" },
            { key: "pccc.create", label: "Tạo mới" },
            { key: "pccc.update", label: "Cập nhật" },
        ],
    },
    {
        key: "security",
        label: "An ninh, tạm trú",
        permissions: [
            { key: "security.read", label: "Xem" },
            { key: "security.create", label: "Tạo mới" },
            { key: "security.update", label: "Cập nhật" },
        ],
    },
    {
        key: "meetings",
        label: "Cuộc họp",
        permissions: [
            { key: "meetings.read", label: "Xem" },
            { key: "meetings.create", label: "Tạo mới" },
            { key: "meetings.update", label: "Cập nhật" },
            { key: "meetings.publish", label: "Đăng cuộc họp" },
            { key: "meetings.register", label: "Đăng ký tham dự" },
        ],
    },
    {
        key: "announcements",
        label: "Thông báo",
        permissions: [
            { key: "announcements.read", label: "Xem" },
            { key: "announcements.create", label: "Tạo mới" },
            { key: "announcements.update", label: "Cập nhật" },
            { key: "announcements.publish", label: "Đăng thông báo" },
        ],
    },
    {
        key: "surveys",
        label: "Khảo sát",
        permissions: [
            { key: "surveys.read", label: "Xem" },
            { key: "surveys.create", label: "Tạo mới" },
            { key: "surveys.update", label: "Chỉnh sửa" },
            { key: "surveys.publish", label: "Mở / đóng khảo sát" },
            { key: "surveys.respond", label: "Trả lời khảo sát" },
        ],
    },
    {
        key: "finance",
        label: "Tài chính",
        permissions: [
            { key: "finance.read", label: "Xem" },
            { key: "finance.create", label: "Tạo mới" },
            { key: "finance.update", label: "Cập nhật" },
            { key: "finance.approve", label: "Duyệt" },
            { key: "finance.delete", label: "Xóa" },
        ],
    },
    {
        key: "reports",
        label: "Báo cáo",
        permissions: [
            { key: "reports.read", label: "Xem" },
            { key: "reports.export", label: "Xuất báo cáo" },
        ],
    },
    {
        key: "files",
        label: "Biểu mẫu, tệp tin",
        permissions: [
            { key: "files.read", label: "Xem" },
            { key: "files.create", label: "Tải lên" },
            { key: "files.update", label: "Cập nhật" },
            { key: "files.delete", label: "Xóa" },
        ],
    },
    {
        key: "settings",
        label: "Cài đặt",
        permissions: [
            { key: "settings.read", label: "Xem" },
            { key: "settings.update", label: "Cập nhật" },
        ],
    },
    {
        key: "imports",
        label: "Nhập dữ liệu",
        permissions: [{ key: "imports.manage", label: "Quản lý nhập dữ liệu" }],
    },
    {
        key: "exports",
        label: "Xuất dữ liệu",
        permissions: [{ key: "exports.export", label: "Xuất dữ liệu" }],
    },
    {
        key: "notifications",
        label: "Thông báo hệ thống",
        permissions: [{ key: "notifications.read", label: "Xem thông báo" }],
    },
];

export const ALL_PERMISSION_KEYS = new Set(
    PERMISSION_REGISTRY.flatMap(group => group.permissions.map(p => p.key)),
);

/**
 * Bo quyen han mac dinh cho 6 vai tro he thong, dung de seed Role collection khi
 * chua co du lieu (xem roleService.ensureSystemRoles). Sau khi seed, admin co the
 * chinh sua permissions cua tung vai tro qua man hinh Vai tro & phan quyen.
 */
export const SEED_ROLE_PERMISSIONS: Record<string, string[]> = {
    resident: [
        "complaints.create",
        "complaints.read_own",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
    ],
    neighborhood_leader: [
        "dashboard.read",
        "households.read",
        "households.create",
        "households.update",
        "households.delete",
        "citizens.read",
        "citizens.create",
        "citizens.update",
        "citizens.delete",
        "complaints.read",
        "complaints.assign",
        "complaints.update_status",
        "pccc.read",
        "security.read",
        "meetings.read",
        "meetings.register",
        "announcements.read",
        "announcements.create",
        "surveys.read",
        "surveys.respond",
        "reports.read",
        "reports.export",
        "files.read",
        "exports.export",
        "notifications.read",
    ],
    secretary: [
        "dashboard.read",
        "households.read",
        "citizens.read",
        "meetings.read",
        "meetings.create",
        "meetings.update",
        "meetings.publish",
        "meetings.register",
        "announcements.read",
        "announcements.create",
        "announcements.update",
        "announcements.publish",
        "surveys.read",
        "surveys.create",
        "surveys.update",
        "surveys.publish",
        "surveys.respond",
        "files.read",
        "files.create",
        "files.update",
        "files.delete",
        "notifications.read",
    ],
    regional_police: [
        "dashboard.read",
        "complaints.read",
        "complaints.assign",
        "complaints.update_status",
        "pccc.read",
        "security.read",
        "security.create",
        "security.update",
        "reports.read",
        "reports.export",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
    ],
    people_committee_official: [
        "dashboard.read",
        "households.read",
        "citizens.read",
        "complaints.read",
        "complaints.assign",
        "complaints.update_status",
        "pccc.read",
        "security.read",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
    ],
    admin: Array.from(ALL_PERMISSION_KEYS),
};
