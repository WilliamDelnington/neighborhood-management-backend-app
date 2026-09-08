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
        // users.read/users.lock/users.reset_password deu duoc userService
        // (listUsers/getUserById/lockUserStatus/resetUserPasswordByAdmin) tu
        // dong gioi han: to truong chi thay/khoa/dat lai mat khau duoc tai
        // khoan house_owner dang so huu nha thuoc to dan pho minh phu trach
        // (xem getHouseOwnerIdsInLeaderScope) - KHONG duoc cap users.update:
        // quyen do khong gioi han theo pham vi va cho sua moi truong cua bat
        // ky nguoi dung nao (doi ten, gan cum, doi vai tro chinh...), khong chi
        // status. users.reset_password them vao de to truong thuc hien duoc
        // loi huong dan "Quen mat khau? lien he to truong" o LoginPage.tsx
        // (resident-web-app).
        "users.read",
        "users.lock",
        "users.reset_password",
        "neighborhoods.read",
        "streets.read",
        // So ha tang (den/duong/cong/cay...) trong to dan pho minh phu trach -
        // xem infrastructureAssetService.ts (B11).
        "infrastructure.read",
        "infrastructure.manage",
        "houses.read",
        "houses.create",
        "houses.update_gis",
        "houses.verify",
        "households.read",
        "households.verify",
        "citizens.read",
        "business_types.read",
        "company_types.read",
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
        // To truong/To pho gui nhiem vu (type "task") xuong dung Nha so/nguoi
        // trong Nha (xem resolveHouseRoleRecipientIds/resolveHouseLeaderRecipientIds
        // trong requestService.ts) - truoc day requests.create chi co secretary.
        "requests.create",
        "request_types.read",
        "complaint_types.read",
        "inspections.read",
        "inspections.execute",
        "inspections.assign",
        "inspections.verify",
        "inspections.submit_to_ward",
        // Du dieu kien duoc chon lam nguoi phu trach khi bi thu gui yeu cau
        // loai "Khac" (vd van ban/giay to hanh chinh) - thieu quyen nay thi
        // to truong khong hien ra trong bo chon nguoi nhan cho loai yeu cau
        // nay (xem eligiblePermissionForType trong requestService.ts).
        "other.assign",
        "meetings.read",
        "meetings.register",
        "announcements.read",
        "news.read",
        "surveys.read",
        "surveys.respond",
        "reports.read",
        "reports.export",
        "reports.author",
        "reports.kpi_read",
        "exports.export",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "notifications.read",
        // Van ban (Cong van/Bao cao/De xuat/Kien nghi...): to truong vua nhan
        // Cong van tu can bo UBND/bi thu, vua co the gui Bao cao/De xuat len -
        // chieu gui/nhan hop le do CorrespondenceType.allowedSenderRoles/
        // allowedReceiverRoles quyet dinh (du lieu), khong con hardcode theo
        // vai tro - xem correspondenceService.ts. Permission o day chi la cong
        // tho chung cho ca hai chieu.
        "correspondences.read",
        "correspondences.create",
        "correspondences.update",
        "correspondences.send",
        "correspondences.reply",
        // To truong duyet/tu choi de nghi thay doi cua chu nha (cung nhom
        // quyen voi houses.verify) va tu gui de nghi doi thong tin cua chinh
        // minh - xem changeRequestService.ts.
        "change_requests.read",
        "change_requests.create",
        "change_requests.decide",
        // To truong/To pho dat lich hen ho cu dan (proxy booking) va xem lich
        // hen trong pham vi to dan pho phu trach - xem appointmentService.ts.
        "appointments.create",
        "appointments.read",
    ],
    // To pho duoc rbac.ts (areaScopeFilter/requireUser) coi NHU HET voi to
    // truong ve pham vi (ca hai deu duoc gan vao assignedNeighborhoodIds va
    // loc theo Neighborhood duoc gan - xem
    // neighborhoodService.assignNeighborhoodColeader) nen dung chung nguyen
    // danh sach permission voi neighborhood_leader ben tren, tranh drift giua
    // hai vai tro le ra phai giong nhau.
    neighborhood_coleader: [
        "dashboard.read",
        "users.create",
        "users.read",
        "users.lock",
        "users.reset_password",
        "neighborhoods.read",
        "streets.read",
        "infrastructure.read",
        "infrastructure.manage",
        "houses.read",
        "houses.create",
        "houses.update_gis",
        "houses.verify",
        "households.read",
        "households.verify",
        "citizens.read",
        "business_types.read",
        "company_types.read",
        "businesses.read",
        "companies.read",
        "usage_units.read",
        "complaints.read",
        "complaints.assign",
        "complaints.update_status",
        "pccc.read",
        "security.read",
        "residents.read",
        "requests.read",
        "requests.create",
        "request_types.read",
        "complaint_types.read",
        "inspections.read",
        "inspections.execute",
        "inspections.assign",
        "inspections.verify",
        "inspections.submit_to_ward",
        "other.assign",
        "meetings.read",
        "meetings.register",
        "announcements.read",
        "news.read",
        "surveys.read",
        "surveys.respond",
        "reports.read",
        "reports.export",
        "reports.author",
        "reports.kpi_read",
        "exports.export",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "notifications.read",
        "correspondences.read",
        "correspondences.create",
        "correspondences.update",
        "correspondences.send",
        "correspondences.reply",
        "change_requests.read",
        "change_requests.create",
        "change_requests.decide",
        "appointments.create",
        "appointments.read",
    ],
    // Cong tac vien: pham vi HEP theo thiet ke (BR-NB-003, xem
    // rbac.ts:areaScopeFilter) - CHI thay du lieu duoc phan cong rieng (vd
    // InspectionTarget.userId, RequestRecipient.userId), khong duoc suy rong
    // thanh toan bo To nhu to truong/to pho. Vi vay KHONG cap houses.read/
    // complaints.read/... o day - permission chi la "duoc phep goi API", con
    // scope filter moi la lop chan thuc su quyet dinh thay duoc gi.
    neighborhood_collaborator: [
        "dashboard.read",
        "requests.read",
        "inspections.read",
        "inspections.execute",
        "meetings.register",
        "surveys.respond",
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
        "neighborhoods.manage",
        "streets.read",
        "houses.read",
        "houses.update_gis",
        "houses.verify",
        "households.read",
        "households.verify",
        "citizens.read",
        "infrastructure.read",
        "business_types.read",
        "company_types.read",
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
        "news.read",
        "news.create",
        "news.update",
        "news.publish",
        "surveys.read",
        "surveys.create",
        "surveys.update",
        "surveys.publish",
        "surveys.respond",
        "reports.read",
        "reports.export",
        "reports.author",
        "reports.receive",
        "reports.review",
        "reports.kpi_read",
        "reports.kpi_manage",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "files.create",
        "files.update",
        "files.delete",
        "notifications.read",
        // Van ban - cung ly do voi neighborhood_leader (xem ghi chu o do): bi
        // thu vua co the gui Cong van xuong to truong, vua co the nhan
        // Bao cao/De xuat tu to truong.
        "correspondences.read",
        "correspondences.create",
        "correspondences.update",
        "correspondences.send",
        "correspondences.reply",
        // Bi thu ("ward secretary") la nguoi gui yeu cau cong viec (PCCC, an
        // ninh, ...) cho cac can bo lien quan.
        "requests.create",
        "requests.read",
        // Bi thu can nam duoc toan bo yeu cau cong viec trong pham vi phuong
        // (khong chi yeu cau tu gui/duoc giao) de dieu phoi - chi xem, KHONG
        // dong nghia duoc sua/huy yeu cau cua nguoi khac (xem requests.update).
        "requests.read_all",
        "request_types.read",
        "request_types.manage",
        "complaint_types.read",
        "complaint_types.manage",
        "inspections.read",
        "inspections.create",
        "inspections.manage",
        "change_requests.read",
        "change_requests.create",
        "change_requests.decide",
        // Bi thu quan tri dich vu dat lich hen (tao/sua dich vu, khung gio,
        // phan cong can bo) va co the tu check-in/hoan thanh neu duoc phan
        // cong - xem appointmentService.ts.
        "appointments.read",
        "appointments.manage",
        "appointments.checkin",
    ],
    regional_police: [
        "dashboard.read",
        "houses.read",
        "houses.update_gis",
        "households.read",
        "citizens.read",
        "business_types.read",
        "company_types.read",
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
        "request_types.read",
        "complaint_types.read",
        "reports.read",
        "reports.export",
        "reports.author",
        "reports.kpi_read",
        "meetings.register",
        "surveys.respond",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "notifications.read",
        "change_requests.create",
        // Cong an khu vuc co the duoc phan cong check-in/hoan thanh lich hen
        // cho mot so dich vu (vd tiep dan lien quan an ninh trat tu) - xem
        // appointmentService.ts.
        "appointments.read",
        "appointments.checkin",
    ],
    people_committee_official: [
        "dashboard.read",
        "neighborhoods.read",
        "neighborhoods.manage",
        "streets.read",
        "houses.read",
        "houses.update_gis",
        "houses.verify",
        "households.read",
        "households.verify",
        "citizens.read",
        "infrastructure.read",
        "business_types.read",
        "company_types.read",
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
        "requests.create",
        "requests.read",
        // Can bo UBND can nam duoc toan bo yeu cau cong viec trong pham vi
        // phuong (khong chi yeu cau tu gui/duoc giao) de dieu phoi - chi xem,
        // KHONG dong nghia duoc sua/huy yeu cau cua nguoi khac (xem requests.update).
        "requests.read_all",
        "request_types.read",
        "request_types.manage",
        "complaint_types.read",
        "complaint_types.manage",
        "inspections.read",
        "inspections.create",
        "inspections.manage",
        "reports.read",
        "reports.export",
        "reports.author",
        "reports.receive",
        "reports.review",
        "reports.kpi_read",
        "reports.kpi_manage",
        "meetings.register",
        "surveys.respond",
        "support_tickets.create",
        "support_tickets.read_own",
        "files.read",
        "notifications.read",
        // Van ban - can bo UBND gui Cong van xuong to truong (pham vi
        // phuong/xa - xem User.wardCode/wardScopeFilter trong rbac.ts) va
        // nhan Bao cao/De xuat tu to truong.
        "correspondences.read",
        "correspondences.create",
        "correspondences.update",
        "correspondences.send",
        "correspondences.reply",
        "change_requests.read",
        "change_requests.create",
        "change_requests.decide",
        // Can bo UBND quan tri dich vu dat lich hen cap phuong/xa - xem
        // appointmentService.ts.
        "appointments.read",
        "appointments.manage",
        "appointments.checkin",
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
        "houses.update_gis",
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
        "company_types.read",
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
        // Sua noi dung, xac nhan hoan thanh, hoac de nghi xem xet lai phan
        // anh CUA CHINH MINH - xem complaintService.ts.
        "complaints.update_own",
        "support_tickets.create",
        "support_tickets.read_own",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
        // Gui de nghi thay doi thong tin nha/ho khau da xac minh, hoac de nghi
        // huy lien ket voi mot nha - xem changeRequestService.ts.
        "change_requests.create",
        // Chu nha dat lich hen voi ward/to dan pho cho chinh nha cua minh - xem
        // appointmentService.ts.
        "appointments.create",
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
        "complaints.update_own",
        "support_tickets.create",
        "support_tickets.read_own",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
        "change_requests.create",
        // Chu ho dat lich hen cho nha minh dang o - xem appointmentService.ts.
        "appointments.create",
    ],
    // Nguoi dai dien ho kinh doanh - tuong tu household_head (tai khoan rieng,
    // do chu nha tao qua createBusinessRepresentativeByOwner va gan vao
    // Business.representativeUserId), nhung pham vi la 1 ho kinh doanh cu the
    // thay vi 1 ho dan. Truoc day representativeUserId khong doi hoi vai tro gi
    // (bat ky tai khoan nao cung gan duoc) - vai tro nay la de tai khoan dai
    // dien co quyen thao tac thuc su tren chinh ho kinh doanh cua minh, khong
    // chi la mot nhan tuy dinh tuyen yeu cau (xem REQUEST_HOUSE_ROLES trong
    // types/index.ts - do la khai niem KHAC, chi la nhan dinh tuyen).
    business_representative: [
        "houses.read",
        "business_types.read",
        "businesses.read",
        "businesses.update",
        "complaints.create",
        "complaints.read_own",
        "complaints.update_own",
        "support_tickets.create",
        "support_tickets.read_own",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
        "change_requests.create",
        "appointments.create",
    ],
    // Nguoi dai dien cong ty/doanh nghiep - cung mo hinh voi business_representative
    // o tren, ap dung cho Company thay vi Business.
    company_representative: [
        "houses.read",
        "company_types.read",
        "companies.read",
        "companies.update",
        "complaints.create",
        "complaints.read_own",
        "complaints.update_own",
        "support_tickets.create",
        "support_tickets.read_own",
        "meetings.register",
        "surveys.respond",
        "files.read",
        "notifications.read",
        "change_requests.create",
        "appointments.create",
    ],
};

// Pham vi du lieu mac dinh cho tung vai tro he thong (xem Role.scopeType/
// scopeMechanism/maxActivePerScope/maxActiveScopesPerUser/subScopeKinds) -
// dung chung boi scripts/seed.ts va tests/helpers.ts, cung ly do/quy uoc voi
// SYSTEM_ROLE_PERMISSIONS o tren (mot noi duy nhat, tranh drift). Day CHI la
// gia tri KHOI TAO - mot khi da seed vao Role collection, admin co the doi lai
// tung vai tro (ke ca vai tro he thong) qua man Quan ly vai tro ma KHONG can
// sua code, dung y nghia "soft-coded" cua tinh nang nay.
export const SYSTEM_ROLE_SCOPE_CONFIG: Record<
    string,
    {
        scopeType: "ALL" | "WARD" | "NEIGHBORHOOD" | "HOUSE" | "HOUSEHOLD" | "BUSINESS" | "COMPANY";
        scopeMechanism?: "ASSIGNED" | "OWNED";
        maxActivePerScope?: number | null;
        maxActiveScopesPerUser?: number | null;
        subScopeKinds?: string[];
    }
> = {
    admin: { scopeType: "ALL" },
    neighborhood_leader: {
        scopeType: "NEIGHBORHOOD",
        scopeMechanism: "ASSIGNED",
        maxActivePerScope: 1,
    },
    // Xem NeighborhoodColeaderAssignment.ts:48-51 - 1 nguoi chi duoc active To
    // pho o 1 To dan pho cung luc, nhung 1 To dan pho co the co nhieu To pho.
    neighborhood_coleader: {
        scopeType: "NEIGHBORHOOD",
        scopeMechanism: "ASSIGNED",
        maxActivePerScope: null,
        maxActiveScopesPerUser: 1,
    },
    neighborhood_collaborator: {
        scopeType: "NEIGHBORHOOD",
        scopeMechanism: "ASSIGNED",
        maxActivePerScope: null,
        subScopeKinds: [
            "WHOLE_NEIGHBORHOOD",
            "STREET",
            "HOUSE_GROUP",
            "CAMPAIGN",
        ],
    },
    // Truoc day khong co gioi han nao (User.wardCode gan tu do) - tu day chi 1
    // Bi thu duoc active tren 1 Phuong/Xa cung luc, giong quy uoc To truong.
    secretary: { scopeType: "WARD", scopeMechanism: "ASSIGNED", maxActivePerScope: 1 },
    people_committee_official: {
        scopeType: "WARD",
        scopeMechanism: "ASSIGNED",
        maxActivePerScope: null,
    },
    // Truoc day khong the gan theo Phuong/Xa qua man Quan ly Phuong (nang luc
    // moi hoan toan) - mac dinh khong gioi han so Cong an khu vuc/Phuong, giong
    // Can bo UBND; dieu chinh lai qua man Quan ly vai tro neu can khac.
    regional_police: {
        scopeType: "WARD",
        scopeMechanism: "ASSIGNED",
        maxActivePerScope: null,
    },
    house_owner: { scopeType: "HOUSE", scopeMechanism: "OWNED" },
    household_head: { scopeType: "HOUSEHOLD", scopeMechanism: "OWNED" },
    business_representative: { scopeType: "BUSINESS", scopeMechanism: "OWNED" },
    company_representative: { scopeType: "COMPANY", scopeMechanism: "OWNED" },
};
