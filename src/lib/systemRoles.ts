import { ALL_PERMISSION_KEYS } from "@/lib/permissionRegistry";

// Permission mac dinh cho 6 vai tro he thong, suy ra tu cac requireRole(...) /
// role-array constant thuc te trong code truoc khi co permission dong (khong
// dung nguyen vi du minh hoa cua spec) de dam bao hanh vi giu nguyen nhu truoc.
// Dung chung boi scripts/seed.ts (seed du lieu thuc) va tests/helpers.ts (seed
// Role cho test) de tranh hai noi bi lech nhau.
export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
    admin: ALL_PERMISSION_KEYS,
    neighborhood_leader: [
        "dashboard.read",
        "users.create",
        // users.read/users.lock deu duoc userService (listUsers/getUserById/
        // lockUserStatus) tu dong gioi han: to truong chi thay/khoa duoc tai
        // khoan house_owner dang so huu nha thuoc to dan pho minh phu trach
        // (xem getHouseOwnerIdsInLeaderScope) - KHONG duoc cap users.update:
        // quyen do khong gioi han theo pham vi va cho sua moi truong cua bat
        // ky nguoi dung nao (doi ten, gan cum, doi vai tro chinh...), khong chi
        // status.
        "users.read",
        "users.lock",
        "neighborhoods.read",
        "streets.read",
        "houses.read",
        "houses.create",
        "houses.verify",
        "households.read",
        "households.verify",
        "citizens.read",
        "business_types.read",
        "businesses.read",
        // Khong co businesses.verify: neighborhood_leader chi duoc xem tien do
        // duyet ho kinh doanh, khong duoc duyet/tu choi giay to (xem
        // businessDocumentService.assertReviewerRoleForRule - fallback rong
        // reviewerRoles se tu choi vai tro nay thay vi cho qua).
        "companies.read",
        "usage_units.read",
        "complaints.read",
        "complaints.assign",
        "complaints.update_status",
        "pccc.read",
        "security.read",
        "residents.read",
        "requests.read",
        "meetings.read",
        "meetings.register",
        "announcements.read",
        "surveys.read",
        "surveys.respond",
        "reports.read",
        "reports.export",
        "exports.export",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "notifications.read",
    ],
    secretary: [
        "dashboard.read",
        // Can de chon "Tổ dân phố" khi nham doi tuong gui Thong bao (xem
        // AnnouncementFormPage.tsx).
        "neighborhoods.read",
        "houses.read",
        "houses.verify",
        "households.read",
        "households.verify",
        "citizens.read",
        "business_types.read",
        "businesses.read",
        // Khong co businesses.verify: secretary chi xem duoc tien do duyet ho
        // kinh doanh, khong duoc duyet/tu choi giay to (xem cung ghi chu o
        // neighborhood_leader ben tren).
        "companies.read",
        "usage_units.read",
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
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "files.create",
        "files.update",
        "files.delete",
        "notifications.read",
        // Bi thu ("ward secretary") la nguoi gui yeu cau cong viec (PCCC, an
        // ninh, ...) cho cac can bo lien quan.
        "requests.create",
        "requests.read",
    ],
    regional_police: [
        "dashboard.read",
        "houses.read",
        "households.read",
        "citizens.read",
        "business_types.read",
        "businesses.read",
        "companies.read",
        "usage_units.read",
        "complaints.read",
        "complaints.assign",
        "complaints.update_status",
        "pccc.read",
        "pccc.create",
        "pccc.update",
        // Du dieu kien duoc chon lam nguoi phu trach khi nhan yeu cau PCCC/an
        // ninh (xem getRoleKeysWithPermission trong requestService).
        "pccc.assign",
        "security.read",
        "security.create",
        "security.update",
        "security.assign",
        "residents.read",
        "residents.create",
        "residents.update",
        "requests.read",
        "reports.read",
        "reports.export",
        "meetings.register",
        "surveys.respond",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "notifications.read",
    ],
    people_committee_official: [
        "dashboard.read",
        "houses.read",
        "houses.verify",
        "households.read",
        "households.verify",
        "citizens.read",
        "business_types.read",
        "businesses.read",
        "businesses.verify",
        "companies.read",
        "companies.verify",
        "usage_units.read",
        "complaints.read",
        "complaints.assign",
        "complaints.update_status",
        "pccc.read",
        "security.read",
        "residents.read",
        "requests.read",
        "meetings.register",
        "surveys.respond",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "notifications.read",
    ],
    house_owner: [
        "organizations.read",
        "organizations.create",
        "organizations.update",
        // Chi de chon duong/pho va to dan pho khi tao/sua nha so cua chinh
        // minh (xem HouseForm.tsx o mini app) - khong cap quyen manage.
        "streets.read",
        "neighborhoods.read",
        "houses.read",
        "houses.create",
        "houses.update",
        "households.read",
        "households.create",
        "households.update",
        "citizens.read",
        "citizens.create",
        "citizens.update",
        "citizens.delete",
        // Chu nha duoc tu khai ho kinh doanh trong nha cua minh - pham vi da
        // duoc gioi han qua assertHouseRecordInScope trong businessService.ts
        // (giong het houses.*/households.*), khong can permission rieng theo
        // scope. Khong cap businesses.delete/verify: xoa lich su khong ai
        // duoc lam (dung active flag de "ngung hoat dong" thay vi xoa), va
        // duyet giay to van thuoc ve cac vai tro chuyen mon.
        "business_types.read",
        "businesses.read",
        "businesses.create",
        "businesses.update",
        // Cong ty/don vi su dung cung ap dung tuong tu ho kinh doanh - chu nha
        // duoc tu khai bao trong pham vi nha cua minh (xem ghi chu businesses
        // o tren).
        "companies.read",
        "companies.create",
        "companies.update",
        "usage_units.read",
        "usage_units.create",
        "usage_units.update",
        "complaints.create",
        "complaints.read_own",
        "support_tickets.create",
        "support_tickets.read_own",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
    ],
    // Chu ho (dung dau hop khau) khac house_owner (chu nha/nguoi dang ky nha):
    // mot nha co the co nhieu ho dan (vd. chinh chu + nguoi thue), moi ho co
    // chu ho rieng quan ly nhan khau cua ho minh nhung khong so huu/cap nhat
    // ban ghi nha (houses.*) - viec do thuoc ve house_owner.
    household_head: [
        "houses.read",
        "households.read",
        "households.update",
        "citizens.read",
        "citizens.create",
        "citizens.update",
        "citizens.delete",
        "complaints.create",
        "complaints.read_own",
        "support_tickets.create",
        "support_tickets.read_own",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
    ],
};
