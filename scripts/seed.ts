/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import mongoose from "mongoose";
import readline from "readline";
import { connectDB } from "@/lib/mongodb";
import { generateSequentialCode, generateYearlyCode } from "@/lib/utils";
import { assertNotProtectedDatabase } from "@/lib/config";

/**
 * Chan cung (KHONG co co bypass nao, khac voi confirmSeed() ben duoi) neu
 * NODE_ENV=production - script nay xoa toan bo du lieu demo
 * (Household/Citizen/HouseRecord/Complaint/...) va khong duoc thiet ke de
 * chay tren du lieu that. Cung mau kiem tra voi
 * lib/config.ts:validateAuthConfig(). --yes/-y/SEED_SKIP_CONFIRM chi bo qua
 * BUOC HOI XAC NHAN o confirmSeed(), KHONG bo qua duoc kiem tra nay.
 */
function assertNotProduction(): void {
    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "Tu choi chay: NODE_ENV=production. npm run seed xoa toan bo du " +
                "lieu demo (Household/Citizen/HouseRecord/Complaint/...) va " +
                "khong duoc phep chay tren moi truong production. Neu day la " +
                "moi truong dev/staging bi gan nham NODE_ENV=production, sua " +
                "lai bien moi truong roi chay lai.",
        );
    }
}

/**
 * Hoi xac nhan truoc khi chay - script nay van xoa-va-tao-lai toan bo du lieu
 * demo (Household, Citizen, HouseRecord, Complaint...), chi rieng User la
 * duoc upsert (xem clearDemoData/seedUsers). Bo qua hoi neu chay voi co
 * `--yes`/`-y`, hoac bien moi truong SEED_SKIP_CONFIRM=true (vd chay tu CI/
 * script tu dong khong co stdin tuong tac).
 */
async function confirmSeed(): Promise<boolean> {
    const skip =
        process.argv.includes("--yes") ||
        process.argv.includes("-y") ||
        process.env.SEED_SKIP_CONFIRM === "true";
    if (skip) return true;

    console.log(
        "\n⚠️  CẢNH BÁO: npm run seed sẽ XÓA VÀ TẠO LẠI toàn bộ dữ liệu demo sau:",
    );
    console.log(
        "   Household, Citizen, HouseRecord, Complaint, ComplaintTimeline, Announcement,",
    );
    console.log(
        "   Meeting, MeetingRegistration, Survey, SurveyResponse, PcccCheck, SecurityRecord,",
    );
    console.log(
        "   FinanceTransaction, FileAsset, Notification, NotificationDelivery, Setting, Role.",
    );
    console.log(
        "   (7 tài khoản mẫu sẽ được CẬP NHẬT LẠI - không xóa; các tài khoản khác,",
    );
    console.log(
        "   ví dụ 21 tổ trưởng, không bị ảnh hưởng.)",
    );

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await new Promise<string>(resolve => {
        rl.question("\nBạn có chắc chắn muốn tiếp tục? (y/N): ", resolve);
    });
    rl.close();

    return /^y(es)?$/i.test(answer.trim());
}

/**
 * Mat khau dev/test dung chung cho moi tai khoan can bo duoc seed, de dang nhap
 * vao trang quan tri web rieng (quan-ly-to-dan-pho-hoa-binh-admin) bang so dien
 * thoai + mat khau thay vi Zalo. CHI dung cho moi truong dev/demo.
 */
const SEED_STAFF_PASSWORD = "HoaBinh@2026";

// Import dong (khong import tinh o dau file) - "../src/models" re-export ca
// Citizen, va Citizen keo theo @/lib/encryption doc bien moi truong
// ENCRYPTION_KEY NGAY LUC IMPORT (module top-level). TypeScript/tsx bien dich
// import tinh (import ... from ...) thanh require() va HOIST len dau file bat
// ke vi tri viet trong source, nen neu import barrel nay o dang tinh, no se
// chay TRUOC ca loadEnv() o tren, gay loi "Thieu bien moi truong ENCRYPTION_KEY"
// - giong ly do scripts/backfill-roles.ts va scripts/seed-neighborhoods.ts phai
// import dong. Cac bien duoi day duoc gan gia tri that trong main(), sau khi
// loadEnv() da chay.
type ModelsModule = typeof import("../src/models");
let User: ModelsModule["User"];
let Role: ModelsModule["Role"];
let HouseRecord: ModelsModule["HouseRecord"];
let Household: ModelsModule["Household"];
let Citizen: ModelsModule["Citizen"];
let Complaint: ModelsModule["Complaint"];
let ComplaintTimeline: ModelsModule["ComplaintTimeline"];
let Announcement: ModelsModule["Announcement"];
let Meeting: ModelsModule["Meeting"];
let MeetingRegistration: ModelsModule["MeetingRegistration"];
let Survey: ModelsModule["Survey"];
let SurveyResponse: ModelsModule["SurveyResponse"];
let PcccCheck: ModelsModule["PcccCheck"];
let SecurityRecord: ModelsModule["SecurityRecord"];
let FinanceTransaction: ModelsModule["FinanceTransaction"];
let FileAsset: ModelsModule["FileAsset"];
let Notification: ModelsModule["Notification"];
let NotificationDelivery: ModelsModule["NotificationDelivery"];
let Setting: ModelsModule["Setting"];
let Neighborhood: ModelsModule["Neighborhood"];
// @/lib/streetSync imports "@/models" (barrel) tu no cung bi anh huong boi
// van de hoist o tren - phai import dong cung luc voi cac model.
let resolveStreetForCluster: typeof import("@/lib/streetSync").resolveStreetForCluster;

import { SYSTEM_ROLE_PERMISSIONS } from "../src/lib/systemRoles";
import { ROLE_LABEL } from "../src/types";

// Anh xa cum dan cu tu do (du lieu mau cu) sang so thu tu to dan pho chinh
// thuc (TDP-01, TDP-02...) - chi dung cho seed du lieu mau, KHONG phai co che
// chung (neighborhoodId van la truong admin gan thu cong cho nha so thuc te,
// vi mot duong/pho co the chay qua nhieu to dan pho - xem models/HouseRecord.ts).
const CLUSTER_TO_NEIGHBORHOOD_SEQUENCE: Record<string, number> = {
    "Cụm 1": 1,
    "Cụm 2": 2,
};

async function clearDemoData() {
    // KHONG xoa User o day: truoc day User.deleteMany({}) xoa TOAN BO tai
    // khoan trong DB (khong chi 7 tai khoan mau), tung lam mat 21 tai khoan
    // to truong that (va bat ky tai khoan chu ho nao khac) moi lan chay lai
    // seed. seedUsers() gio tu upsert 7 tai khoan mau theo `phone` (xem
    // upsertDemoUser) thay vi xoa-roi-tao-lai, nen an toan de chay nhieu lan
    // ma khong dong den tai khoan nao khac ngoai 7 tai khoan mau nay.
    await Promise.all([
        Role.deleteMany({}),
        HouseRecord.deleteMany({}),
        Household.deleteMany({}),
        Citizen.deleteMany({}),
        Complaint.deleteMany({}),
        ComplaintTimeline.deleteMany({}),
        Announcement.deleteMany({}),
        Meeting.deleteMany({}),
        MeetingRegistration.deleteMany({}),
        Survey.deleteMany({}),
        SurveyResponse.deleteMany({}),
        PcccCheck.deleteMany({}),
        SecurityRecord.deleteMany({}),
        FinanceTransaction.deleteMany({}),
        FileAsset.deleteMany({}),
        Notification.deleteMany({}),
        NotificationDelivery.deleteMany({}),
        Setting.deleteMany({}),
    ]);
}

async function seedRoles(actorId: string) {
    const keys = Object.keys(SYSTEM_ROLE_PERMISSIONS);
    await Role.create(
        keys.map((key, index) => ({
            key,
            name: ROLE_LABEL[key] || key,
            permissions: SYSTEM_ROLE_PERMISSIONS[key],
            system: true,
            active: true,
            sortOrder: index,
            createdBy: actorId,
            updatedBy: actorId,
        })),
    );
}

/**
 * Tao hoac cap nhat lai (KHONG xoa-roi-tao-lai) mot tai khoan mau, dinh danh
 * boi `phone` (unique) - an toan de chay lai nhieu lan va khong dong den bat
 * ky tai khoan nao khac ngoai dung 7 so dien thoai mau (0900000001..07). Xem
 * ghi chu o clearDemoData() de biet ly do doi tu User.deleteMany({}).
 */
async function upsertDemoUser(fields: {
    zaloUserId: string;
    displayName: string;
    phone: string;
    passwordHash?: string;
    address?: string;
    roles: string[];
    primaryRole: string;
    assignedClusters?: string[];
    notificationPermission?: boolean;
}) {
    const existing = await User.findOne({ phone: fields.phone });
    if (existing) {
        existing.zaloUserId = fields.zaloUserId;
        existing.displayName = fields.displayName;
        if (fields.passwordHash) existing.passwordHash = fields.passwordHash;
        existing.address = fields.address;
        existing.roles = fields.roles;
        existing.primaryRole = fields.primaryRole;
        if (fields.assignedClusters) {
            existing.assignedClusters = fields.assignedClusters;
        }
        if (fields.notificationPermission !== undefined) {
            existing.notificationPermission = fields.notificationPermission;
        }
        existing.status = "active";
        await existing.save();
        return existing;
    }
    return User.create({ ...fields, status: "active" });
}

async function seedUsers() {
    // Import dong (khong import tinh o dau file) vi @/lib/auth kiem tra bien
    // moi truong JWT_SECRET ngay khi module duoc load - cac import tinh se bi
    // hoist len truoc cac loi goi loadEnv() o dau file, khien module nay load
    // truoc khi .env.local duoc doc va nem loi "Thieu bien moi truong JWT_SECRET".
    const { hashPassword } = await import("@/lib/auth");
    const staffPasswordHash = await hashPassword(SEED_STAFF_PASSWORD);

    const admin = await upsertDemoUser({
        zaloUserId: "seed-admin",
        displayName: "Quản trị viên Hòa Bình",
        phone: "0900000001",
        passwordHash: staffPasswordHash,
        address: "Nhà văn hóa Tổ dân phố Hòa Bình",
        roles: ["admin"],
        primaryRole: "admin",
        notificationPermission: true,
    });

    const leader = await upsertDemoUser({
        zaloUserId: "seed-leader",
        displayName: "Nguyễn Văn Tổ Trưởng",
        phone: "0900000002",
        passwordHash: staffPasswordHash,
        address: "Cụm 1, Tổ dân phố Hòa Bình",
        roles: ["neighborhood_leader"],
        primaryRole: "neighborhood_leader",
        assignedClusters: ["Cụm 1", "Cụm 2"],
        notificationPermission: true,
    });

    const secretary = await upsertDemoUser({
        zaloUserId: "seed-secretary",
        displayName: "Trần Thị Bí Thư",
        phone: "0900000003",
        passwordHash: staffPasswordHash,
        roles: ["secretary"],
        primaryRole: "secretary",
    });

    const police = await upsertDemoUser({
        zaloUserId: "seed-police",
        displayName: "Lê Văn Công An",
        phone: "0900000004",
        passwordHash: staffPasswordHash,
        roles: ["regional_police"],
        primaryRole: "regional_police",
    });

    const committee = await upsertDemoUser({
        zaloUserId: "seed-committee",
        displayName: "Phạm Thị Cán Bộ UBND",
        phone: "0900000005",
        passwordHash: staffPasswordHash,
        roles: ["people_committee_official"],
        primaryRole: "people_committee_official",
    });

    const houseOwner = await upsertDemoUser({
        zaloUserId: "seed-house-owner",
        displayName: "Hoàng Văn Dân",
        phone: "0900000006",
        address: "Số 12, Cụm 1, Tổ dân phố Hòa Bình",
        roles: ["house_owner"],
        primaryRole: "house_owner",
        notificationPermission: true,
    });

    // Chu ho cua mot ho dan khac song trong CUNG nha so voi houseOwner (0900000006)
    // - vd. ho thue tro - de phan biet voi house_owner (chu nha). Dang nhap qua
    // Zalo (khong co passwordHash) giong houseOwner, dai dien cho "Nguoi dan".
    const householdHead = await upsertDemoUser({
        zaloUserId: "seed-household-head",
        displayName: "Đỗ Văn Hạnh",
        phone: "0900000007",
        address: "Số 22, ngõ 8, Cụm 2",
        roles: ["household_head"],
        primaryRole: "household_head",
        notificationPermission: true,
    });

    return { admin, leader, secretary, police, committee, houseOwner, householdHead };
}

async function seedHouseholds(actorId: string) {
    const data = [
        {
            cluster: "Cụm 1",
            address: "Số 1, ngõ 12, Cụm 1",
            headOfHousehold: "Nguyễn Văn An",
            phone: "0911111111",
            memberCount: 4,
            ownershipType: "chinh_chu" as const,
            needsSupport: false,
        },
        {
            cluster: "Cụm 1",
            address: "Số 3, ngõ 12, Cụm 1",
            headOfHousehold: "Trần Thị Bình",
            phone: "0911111112",
            memberCount: 2,
            ownershipType: "chinh_chu" as const,
            needsSupport: true,
            note: "Hộ neo đơn, người cao tuổi",
        },
        {
            cluster: "Cụm 1",
            address: "Số 5, ngõ 12, Cụm 1",
            headOfHousehold: "Lê Văn Cường",
            phone: "0911111113",
            memberCount: 6,
            ownershipType: "cho_thue" as const,
            needsSupport: false,
            note: "Nhà cho thuê trọ đông người",
        },
        {
            cluster: "Cụm 2",
            address: "Số 20, ngõ 8, Cụm 2",
            headOfHousehold: "Phạm Thị Dung",
            phone: "0911111114",
            memberCount: 3,
            ownershipType: "chinh_chu" as const,
            needsSupport: false,
        },
        {
            cluster: "Cụm 2",
            address: "Số 22, ngõ 8, Cụm 2",
            headOfHousehold: "Hoàng Văn Em",
            phone: "0911111115",
            memberCount: 5,
            ownershipType: "cho_thue" as const,
            needsSupport: false,
        },
    ];

    const households = [];
    let houseOwnerHouseId: mongoose.Types.ObjectId | undefined;
    for (const item of data) {
        // Moi ho dan mau gan voi MOT nha so rieng (dia chi thuc te khac nhau),
        // tranh nhieu ho dan cung tro vao mot nha so dung chung - se lam sai
        // lech cac bao cao/thong ke tinh theo tung nha (vd. mucrisk PCCC, xem
        // services/pcccService.ts getHouseRiskSummary).
        const houseCode = await generateSequentialCode(HouseRecord, "NS", 3);
        // Dong bo cluster <-> streetId giong het duong di qua createHouseRecord
        // service (xem lib/streetSync.ts) - de nha so mau khong bi "mo coi"
        // duong/pho nhu truoc khi tao thang qua HouseRecord.create().
        // eslint-disable-next-line no-await-in-loop
        const { streetId } = await resolveStreetForCluster(item.cluster);
        const neighborhoodSequence = CLUSTER_TO_NEIGHBORHOOD_SEQUENCE[item.cluster];
        // eslint-disable-next-line no-await-in-loop
        const neighborhood = neighborhoodSequence
            ? await Neighborhood.findOne({ sequence: neighborhoodSequence })
            : null;
        // eslint-disable-next-line no-await-in-loop
        const house = await HouseRecord.create({
            code: houseCode,
            cluster: item.cluster,
            streetId,
            neighborhoodId: neighborhood?._id,
            address: item.address,
            status: "verified",
            ownerId: actorId,
            createdBy: actorId,
            updatedBy: actorId,
        });

        const code = await generateSequentialCode(Household, "HB", 3);
        // eslint-disable-next-line no-await-in-loop
        const household = await Household.create({
            ...item,
            code,
            houseId: house._id,
            createdBy: actorId,
        });
        households.push(household);
        if (item.address === "Số 22, ngõ 8, Cụm 2") houseOwnerHouseId = house._id;
    }

    // Ho dan thu hai cung tru trong nha so cua houseOwner (0900000006) - vd. ho
    // thue tro song chung nha voi chu nha - dai dien boi tai khoan mau vai tro
    // household_head. Dung lai houseId co san, KHONG tao HouseRecord moi.
    const householdHeadCode = await generateSequentialCode(Household, "HB", 3);
    const householdHeadHousehold = await Household.create({
        cluster: "Cụm 2",
        address: "Số 22, ngõ 8, Cụm 2",
        headOfHousehold: "Đỗ Văn Hạnh",
        phone: "0900000007",
        memberCount: 1,
        ownershipType: "cho_thue" as const,
        needsSupport: false,
        note: "Hộ thuê trọ, sống cùng nhà với chủ nhà",
        code: householdHeadCode,
        houseId: houseOwnerHouseId,
        createdBy: actorId,
    });
    households.push(householdHeadHousehold);

    return households;
}

async function seedCitizens(households: any[], actorId: string) {
    const [h1, h2, h3, h4, h5, h6] = households;

    const citizensData = [
        {
            fullName: "Nguyễn Văn An",
            householdId: h1._id,
            gender: "nam",
            relationToHead: "Chủ hộ",
            cccd: "001090001111",
            birthDate: new Date("1980-05-01"),
        },
        {
            fullName: "Nguyễn Thị Lan",
            householdId: h1._id,
            gender: "nu",
            relationToHead: "Vợ",
            cccd: "001090001112",
            birthDate: new Date("1982-08-10"),
        },
        {
            fullName: "Nguyễn Văn Bảo",
            householdId: h1._id,
            gender: "nam",
            relationToHead: "Con",
            cccd: "001090001113",
            birthDate: new Date("2012-02-14"),
            isChild: true,
        },
        {
            fullName: "Trần Thị Bình",
            householdId: h2._id,
            gender: "nu",
            relationToHead: "Chủ hộ",
            cccd: "001090002111",
            birthDate: new Date("1950-01-01"),
            isElderly: true,
        },
        {
            fullName: "Trần Văn Cụ",
            householdId: h2._id,
            gender: "nam",
            relationToHead: "Chồng",
            cccd: "001090002112",
            birthDate: new Date("1948-03-03"),
            isElderly: true,
            isDisabledOrSupportNeeded: true,
        },
        {
            fullName: "Lê Văn Cường",
            householdId: h3._id,
            gender: "nam",
            relationToHead: "Chủ hộ",
            cccd: "001090003111",
            birthDate: new Date("1975-06-06"),
            isPartyMember: true,
        },
        {
            fullName: "Lê Thị Dịu",
            householdId: h3._id,
            gender: "nu",
            relationToHead: "Người thuê trọ",
            residenceType: "tam_tru",
            cccd: "001090003112",
            birthDate: new Date("1995-09-09"),
        },
        {
            fullName: "Phạm Thị Dung",
            householdId: h4._id,
            gender: "nu",
            relationToHead: "Chủ hộ",
            cccd: "001090004111",
            birthDate: new Date("1988-04-04"),
            isUnionMember: true,
        },
        {
            fullName: "Phạm Văn Đức",
            householdId: h4._id,
            gender: "nam",
            relationToHead: "Con",
            cccd: "001090004112",
            birthDate: new Date("2015-07-07"),
            isChild: true,
        },
        {
            fullName: "Hoàng Văn Dân",
            householdId: h5._id,
            gender: "nam",
            relationToHead: "Chủ hộ",
            cccd: "001090005111",
            birthDate: new Date("1990-10-10"),
        },
        {
            fullName: "Đỗ Văn Hạnh",
            householdId: h6._id,
            gender: "nam",
            relationToHead: "Chủ hộ",
            residenceType: "tam_tru",
            cccd: "001090006111",
            birthDate: new Date("1985-11-20"),
        },
    ];

    const citizens = [];
    for (const item of citizensData) {
        // eslint-disable-next-line no-await-in-loop
        const citizen = await Citizen.create({ ...item, createdBy: actorId });
        citizens.push(citizen);
    }

    for (const household of households) {
        // eslint-disable-next-line no-await-in-loop
        const count = await Citizen.countDocuments({
            householdId: household._id,
        });
        // eslint-disable-next-line no-await-in-loop
        await Household.findByIdAndUpdate(household._id, {
            memberCount: count,
        });
    }

    return {
        citizens,
        houseOwnerHouseholdId: h5._id,
        houseOwnerCitizenId: citizens[9]._id,
        householdHeadHouseholdId: h6._id,
        householdHeadCitizenId: citizens[10]._id,
    };
}

async function seedComplaints(houseOwnerId: string, leaderId: string) {
    const items: Array<{
        category: any;
        title: string;
        content: string;
        status: any;
        area: string;
    }> = [
        {
            category: "ve_sinh_moi_truong",
            title: "Rác thải tồn đọng ở ngõ 12",
            content: "Rác không được thu gom 3 ngày nay, gây mùi hôi khó chịu.",
            status: "moi_tiep_nhan",
            area: "Ngõ 12, Cụm 1",
        },
        {
            category: "chieu_sang",
            title: "Bóng đèn đường bị hỏng",
            content:
                "Đèn đường đầu ngõ 8 không sáng gần 1 tuần, ảnh hưởng an toàn đi lại buổi tối.",
            status: "dang_xu_ly",
            area: "Ngõ 8, Cụm 2",
        },
        {
            category: "an_ninh_trat_tu",
            title: "Tụ tập gây ồn ào ban đêm",
            content: "Có nhóm thanh niên tụ tập uống rượu gây ồn ào sau 23h.",
            status: "da_tiep_nhan",
            area: "Cụm 1",
        },
        {
            category: "ha_tang_dien_nuoc",
            title: "Nước yếu vào giờ cao điểm",
            content: "Áp lực nước rất yếu vào buổi sáng từ 6h-8h.",
            status: "da_xu_ly",
            area: "Cụm 2",
        },
        {
            category: "gop_y_chung",
            title: "Đề nghị lắp thêm ghế đá công viên nhỏ",
            content:
                "Khu vực sân chung cụm 1 chưa có chỗ ngồi cho người cao tuổi.",
            status: "dong",
            area: "Cụm 1",
        },
    ];

    for (const item of items) {
        const code = await generateYearlyCode(Complaint, "HB-PA");
        // eslint-disable-next-line no-await-in-loop
        const complaint = await Complaint.create({
            code,
            category: item.category,
            title: item.title,
            content: item.content,
            area: item.area,
            status: item.status,
            createdByUserId: houseOwnerId,
            assigneeId: item.status === "moi_tiep_nhan" ? undefined : leaderId,
        });

        // eslint-disable-next-line no-await-in-loop
        await ComplaintTimeline.create({
            complaintId: complaint._id,
            status: "moi_tiep_nhan",
            note: "Phản ánh đã được tiếp nhận",
            isPublic: true,
            actorId: houseOwnerId,
        });

        if (item.status !== "moi_tiep_nhan") {
            // eslint-disable-next-line no-await-in-loop
            await ComplaintTimeline.create({
                complaintId: complaint._id,
                status: item.status,
                note: "Cập nhật trạng thái xử lý",
                isPublic: true,
                actorId: leaderId,
            });
        }
    }
}

async function seedAnnouncements(actorId: string) {
    await Announcement.create([
        {
            title: "Lịch họp tổ dân phố quý mới",
            content:
                "Kính mời bà con tham dự cuộc họp tổ dân phố vào cuối tuần này.",
            category: "hop_dan",
            status: "da_dang",
            pinned: true,
            publishedAt: new Date(),
            createdBy: actorId,
        },
        {
            title: "Khuyến cáo phòng cháy chữa cháy mùa hanh khô",
            content:
                "Đề nghị các hộ dân kiểm tra bình chữa cháy, không để vật dụng dễ cháy gần nguồn điện.",
            category: "pccc",
            status: "da_dang",
            priority: true,
            publishedAt: new Date(),
            createdBy: actorId,
        },
        {
            title: "Dự thảo kế hoạch vệ sinh môi trường tháng tới",
            content:
                "Bản dự thảo đang được lấy ý kiến, sẽ đăng công khai sau khi hoàn thiện.",
            category: "ve_sinh_moi_truong",
            status: "nhap",
            createdBy: actorId,
        },
    ]);
}

async function seedMeetings(actorId: string, houseOwnerId: string) {
    const upcoming = await Meeting.create({
        title: "Họp dân quý III",
        startTime: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        location: "Nhà văn hóa Tổ dân phố Hòa Bình",
        content:
            "Thông qua kế hoạch thu chi quý III và triển khai công tác PCCC.",
        published: true,
        createdBy: actorId,
    });

    await MeetingRegistration.create({
        meetingId: upcoming._id,
        userId: houseOwnerId,
        answer: "co",
    });

    await Meeting.create({
        title: "Họp dân quý II (đã diễn ra)",
        startTime: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        location: "Nhà văn hóa Tổ dân phố Hòa Bình",
        content: "Đã tổng kết công tác quý II.",
        minutes:
            "Biên bản: 100% hộ dân đồng thuận kế hoạch vệ sinh môi trường.",
        published: true,
        createdBy: actorId,
    });
}

async function seedSurveys(actorId: string, houseOwnerId: string) {
    const survey = await Survey.create({
        title: "Khảo sát mức độ hài lòng về an ninh trật tự",
        description:
            "Ý kiến của bà con giúp tổ dân phố cải thiện công tác an ninh.",
        status: "dang_mo",
        openDate: new Date(),
        eligibleAll: true,
        questions: [
            {
                question: "Bạn có hài lòng với an ninh khu vực hiện tại?",
                type: "dong_y_khong_dong_y",
                options: [],
                required: true,
            },
            {
                question: "Vấn đề nào bạn quan tâm nhất?",
                type: "chon_mot",
                options: [
                    "An ninh trật tự",
                    "Vệ sinh môi trường",
                    "PCCC",
                    "Hạ tầng điện nước",
                ],
                required: true,
            },
        ],
        createdBy: actorId,
    });

    const [q1, q2] = survey.questions;
    await SurveyResponse.create({
        surveyId: survey._id,
        userId: houseOwnerId,
        answers: [
            { questionId: q1._id, selectedOptions: ["Đồng ý"] },
            { questionId: q2._id, selectedOptions: ["An ninh trật tự"] },
        ],
    });
}

async function seedPcccAndSecurity(
    households: any[],
    leaderId: string,
    policeId: string,
) {
    const [h1, h2, h3] = households;

    await PcccCheck.create([
        {
            houseId: h1.houseId,
            hasFireExtinguisher: true,
            hasEmergencyExit: true,
            riskLevel: "xanh",
            inspectionDate: new Date(),
            inspectorId: leaderId,
        },
        {
            houseId: h2.houseId,
            hasFireExtinguisher: false,
            hasGasStoveOrStorageOrBusiness: true,
            riskLevel: "vang",
            remediationNeeded: "Trang bị bình chữa cháy mini",
            inspectionDate: new Date(),
            inspectorId: leaderId,
        },
        {
            houseId: h3.houseId,
            hasFireExtinguisher: false,
            hasIndoorEvCharging: true,
            isCrowdedRental: true,
            riskLevel: "do",
            remediationNeeded:
                "Yêu cầu di dời điểm sạc xe điện ra ngoài, bổ sung lối thoát hiểm",
            inspectionDate: new Date(),
            inspectorId: leaderId,
        },
    ]);

    await SecurityRecord.create([
        {
            houseId: h1.houseId,
            ownershipType: "chinh_chu",
            level: "binh_thuong",
            monitoringStatus: "binh_thuong",
            inspectionDate: new Date(),
            createdBy: policeId,
            updatedBy: policeId,
        },
        {
            houseId: h3.houseId,
            ownershipType: "cho_thue",
            renterCount: 6,
            level: "can_theo_doi",
            monitoringStatus: "dang_theo_doi",
            note: "Đã nhắc nhở chủ nhà khai báo cư trú cho người thuê",
            inspectionDate: new Date(),
            createdBy: policeId,
            updatedBy: policeId,
        },
    ]);
}

async function seedFinance(actorId: string) {
    await FinanceTransaction.create([
        {
            type: "thu",
            partyName: "Các hộ dân Cụm 1",
            amount: 5000000,
            transactionDate: new Date(),
            content: "Thu quỹ vệ sinh môi trường quý III",
            status: "da_duyet",
            createdBy: actorId,
        },
        {
            type: "thu",
            partyName: "Các hộ dân Cụm 2",
            amount: 4200000,
            transactionDate: new Date(),
            content: "Thu quỹ vệ sinh môi trường quý III",
            status: "da_duyet",
            createdBy: actorId,
        },
        {
            type: "chi",
            partyName: "Công ty vệ sinh môi trường",
            amount: 3500000,
            transactionDate: new Date(),
            content: "Chi phí thu gom rác thải quý III",
            status: "da_duyet",
            createdBy: actorId,
        },
        {
            type: "chi",
            partyName: "Đội PCCC cơ sở",
            amount: 1200000,
            transactionDate: new Date(),
            content: "Mua bình chữa cháy bổ sung",
            status: "nhap",
            createdBy: actorId,
        },
    ]);
}

async function seedFiles(actorId: string) {
    await FileAsset.create([
        {
            name: "Đơn đăng ký tạm trú, tạm vắng",
            description: "Mẫu đơn dùng cho hộ có người thuê trọ",
            url: "https://dichvucong.gov.vn/mau-don-tam-tru",
            category: "form",
            isPublic: true,
            uploadedBy: actorId,
        },
        {
            name: "Biên bản họp tổ dân phố (mẫu)",
            url: "https://dichvucong.gov.vn/mau-bien-ban-hop",
            category: "form",
            isPublic: true,
            uploadedBy: actorId,
        },
    ]);
}

async function seedSettings(actorId: string) {
    await Setting.create([
        {
            key: "app_identity",
            value: {
                name: "Tổ dân phố Hòa Bình",
                ward: "Phường Dương Nội",
                city: "Hà Nội",
            },
            description: "Thông tin định danh ứng dụng",
            updatedBy: actorId,
        },
        {
            key: "emergency_contacts",
            value: [
                { label: "Công an (113)", phone: "113" },
                { label: "Phòng cháy chữa cháy (114)", phone: "114" },
                { label: "Cấp cứu y tế (115)", phone: "115" },
            ],
            description: "Số điện thoại liên hệ khẩn cấp",
            updatedBy: actorId,
        },
        {
            key: "committee_members",
            value: [
                { role: "Bí thư Chi bộ", name: "Nguyễn Văn A", phone: "0912345678" },
                { role: "Tổ trưởng Tổ dân phố", name: "Trần Thị B", phone: "0923456789" },
                { role: "Tổ phó Tổ dân phố", name: "Lê Văn C", phone: "0934567890" },
                { role: "Trưởng ban Công tác Mặt trận", name: "Phạm Thị D", phone: "0945678901" },
            ],
            description: "Ban công tác Tổ dân phố",
            updatedBy: actorId,
        },
        {
            key: "community_stats",
            value: {
                totalHouseholds: 186,
                totalResidents: 742,
                leaderName: "Trần Thị B",
                termLabel: "2024-2029",
            },
            description: "Số liệu thống kê hiển thị ở trang chủ cổng thông tin",
            updatedBy: actorId,
        },
    ]);
}

async function seedNotifications(adminId: string) {
    const notification = await Notification.create({
        title: "Chào mừng đến với Mini App Tổ dân phố Hòa Bình",
        body: "Tra cứu thông báo, gửi phản ánh và theo dõi hoạt động tổ dân phố ngay trên Zalo.",
        type: "system.welcome",
        targetUserIds: [adminId],
        channel: "in_app",
        status: "sent",
        createdBy: adminId,
    });

    await NotificationDelivery.create({
        notificationId: notification._id,
        userId: adminId,
        channel: "in_app",
        sentAt: new Date(),
    });
}

async function main() {
    assertNotProduction();
    assertNotProtectedDatabase(process.env.MONGODB_URI as string);

    const confirmed = await confirmSeed();
    if (!confirmed) {
        console.log("\nĐã hủy - không có dữ liệu nào bị thay đổi.");
        process.exit(0);
    }

    ({
        User,
        Role,
        HouseRecord,
        Household,
        Citizen,
        Complaint,
        ComplaintTimeline,
        Announcement,
        Meeting,
        MeetingRegistration,
        Survey,
        SurveyResponse,
        PcccCheck,
        SecurityRecord,
        FinanceTransaction,
        FileAsset,
        Notification,
        NotificationDelivery,
        Setting,
        Neighborhood,
    } = await import("../src/models"));
    ({ resolveStreetForCluster } = await import("@/lib/streetSync"));

    await connectDB();
    console.log("Đang xóa dữ liệu demo cũ...");
    await clearDemoData();

    console.log("Đang tạo tài khoản mẫu cho từng vai trò...");
    const { admin, leader, police, houseOwner, householdHead } =
        await seedUsers();

    console.log("Đang tạo 7 vai trò hệ thống...");
    await seedRoles(String(admin._id));

    console.log("Đang tạo hộ dân mẫu...");
    // Chu nha (ownerId) la house_owner mau, khong phai admin - admin van xem
    // duoc moi nha so (bypass moi kiem tra scope), nhung "chu so huu" thuc su
    // phai la tai khoan house_owner de du lieu mau phan anh dung mo hinh so huu.
    const households = await seedHouseholds(String(houseOwner._id));

    console.log("Đang tạo nhân khẩu mẫu...");
    const {
        houseOwnerHouseholdId,
        houseOwnerCitizenId,
        householdHeadHouseholdId,
        householdHeadCitizenId,
    } = await seedCitizens(households, String(admin._id));
    await User.findByIdAndUpdate(houseOwner._id, {
        householdId: houseOwnerHouseholdId,
        citizenId: houseOwnerCitizenId,
    });
    await User.findByIdAndUpdate(householdHead._id, {
        householdId: householdHeadHouseholdId,
        citizenId: householdHeadCitizenId,
    });

    console.log("Đang tạo phản ánh mẫu...");
    await seedComplaints(String(houseOwner._id), String(leader._id));

    console.log("Đang tạo thông báo mẫu...");
    await seedAnnouncements(String(admin._id));

    console.log("Đang tạo cuộc họp mẫu...");
    await seedMeetings(String(admin._id), String(houseOwner._id));

    console.log("Đang tạo khảo sát mẫu...");
    await seedSurveys(String(admin._id), String(houseOwner._id));

    console.log("Đang tạo dữ liệu PCCC và an ninh mẫu...");
    await seedPcccAndSecurity(
        households,
        String(leader._id),
        String(police._id),
    );

    console.log("Đang tạo dữ liệu tài chính mẫu...");
    await seedFinance(String(admin._id));

    console.log("Đang tạo biểu mẫu mẫu...");
    await seedFiles(String(admin._id));

    console.log("Đang tạo cấu hình hệ thống mẫu...");
    await seedSettings(String(admin._id));

    console.log("Đang tạo thông báo hệ thống mẫu...");
    await seedNotifications(String(admin._id));

    console.log(
        "\nHoàn tất seed dữ liệu demo. Tài khoản mẫu (zaloUserId dùng cho dang nhap sandbox):",
    );
    console.log("  admin                     -> seed-admin");
    console.log("  neighborhood_leader       -> seed-leader");
    console.log("  secretary                 -> seed-secretary");
    console.log("  regional_police           -> seed-police");
    console.log("  people_committee_official -> seed-committee");
    console.log("  house_owner               -> seed-house-owner");
    console.log("  household_head            -> seed-household-head");
    console.log(
        "\nDang nhap trang quan tri web (so dien thoai + mat khau, xem @/lib/phone cho dinh dang):",
    );
    console.log(`  Mat khau chung cho moi tai khoan can bo: ${SEED_STAFF_PASSWORD}`);
    console.log("  admin                     -> 0900000001");
    console.log("  neighborhood_leader       -> 0900000002");
    console.log("  secretary                 -> 0900000003");
    console.log("  regional_police           -> 0900000004");
    console.log("  people_committee_official -> 0900000005");

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Seed that bai:", err);
    process.exit(1);
});
