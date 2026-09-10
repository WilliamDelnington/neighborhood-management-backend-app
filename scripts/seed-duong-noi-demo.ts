/* eslint-disable no-console */
/**
 * Bo sung du lieu demo cho 5 to dan pho thuoc phuong Duong Noi (wardCode 9886):
 *   - Dam bao co du 5 to dan pho TDP-01..TDP-05 (dev truoc day chi co 3, doi
 *     chieu voi production de tao bu TDP-04/05 cho khop ten/sequence).
 *   - 2 tai khoan Can bo UBND (people_committee_official) cho phuong.
 *   - Voi MOI to dan pho trong 5 to: 8 nha so, 10 ho dan, 6 ho kinh doanh,
 *     2 cong ty (chu nha da dang ca nhan/to chuc, mot so tai khoan dung chung
 *     lam chu nha + chu ho + dai dien ho kinh doanh cung luc), 1 to pho + 2
 *     cong tac vien.
 *   - Ho dan duoc da dang hoa cac "trang thai dac biet" (needsSupport/
 *     isNearPoor/isMartyrFamilyHousehold/isLonelyElderly) va tinh trang dich
 *     benh (diseaseStatus/diseaseName) de co du lieu mau cho danh sach "Xuat
 *     danh sach theo doi dich benh" va cac bo loc trang thai ho dan.
 *   - Moi ho dan co THEM 1 nhan khau phu (ngoai chu ho tu dong tao boi
 *     createHousehold) voi nghe nghiep, loai cu tru da dang (mot so "tam tru"
 *     kem khoang thoi gian tu ngay-den ngay), va tinh trang da/chua khai bao
 *     cu tru khac nhau.
 *   - 15 ban ghi PCCC, 15 ban ghi An ninh (muc do/tinh trang khac nhau).
 *   - 25 Request (Yeu cau) tu nhieu tai khoan gui khac nhau, cho nhieu tai
 *     khoan nhan khac nhau, trai deu 6 trang thai qua dung luong chuyen trang
 *     thai cua requestService (khong ghi de RequestRecipient.status truc tiep).
 *
 * Script CHAY BO SUNG (non-destructive), idempotent: moi tai khoan moi duoc
 * dinh danh bang so dien thoai sinh TU NOI DUNG (to dan pho + vai tro + so
 * thu tu, xem phoneFor()) - KHONG phai tu mot bo dem vi tri (da gay loi lon
 * du lieu o lan dau, xem git history/session log) - nen chay lai nhieu lan
 * (bat ke thu tu/so luong to dan pho duyet qua) luon sinh RA DUNG CUNG so
 * dien thoai va tai su dung tai khoan da ton tai thay vi tao trung. Cac loi
 * goi Neighborhood/
 * House/Household/Business/Company/PcccCheck/SecurityRecord/Request deu di qua
 * dung service layer (khong Model.create truc tiep bo qua validation/side
 * effects), dung actor la tai khoan admin dau tien trong he thong de duoc bo
 * qua het cac kiem tra pham vi/quyen (giong cach cac script seed khac lam).
 *
 * Chay: npm run seed:duong-noi-demo   (hoac: tsx scripts/seed-duong-noi-demo.ts)
 *
 * LUU Y DNS/IMPORT: xem giai thich chi tiet trong scripts/create-proposal-accounts.ts
 * va scripts/seed-neighborhoods.ts - phai nap .env TRUOC, import cac
 * model/service qua dynamic import() SAU khi env da san sang.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

type ModelsModule = typeof import("../src/models");
type IUserDoc = InstanceType<ModelsModule["User"]>;

const WARD_CODE = 9886;
const WARD_NAME = "Phường Dương Nội";
const DEFAULT_PASSWORD = "DuongNoi@2026";

const HOUSES_PER_NEIGHBORHOOD = 8;
const HOUSEHOLDS_PER_NEIGHBORHOOD = 10;
const BUSINESSES_PER_NEIGHBORHOOD = 6;
const COMPANIES_PER_NEIGHBORHOOD = 2;
const INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD = 6;
const ORG_OWNED_HOUSES_PER_NEIGHBORHOOD = 2; // trong tong 8 nha, 6 ca nhan + 2 to chuc
const TOTAL_PCCC = 15;
const TOTAL_SECURITY = 15;
const TOTAL_REQUESTS = 25;

// So dien thoai duoc sinh TU NOI DUNG (to dan pho + vai tro + so thu tu),
// KHONG phai tu mot bo dem vi tri tang dan - bai hoc rut ra tu lan chay dau:
// dung bo dem toan cuc (`let counter; nextPhone(){ return counter++ }`) khien
// so dien thoai cua MOI nguoi phu thuoc vao THU TU cac to dan pho duoc xu ly
// truoc do; khi TDP-04-DUONGNOI duoc tao moi va chen vao giua danh sach o lan
// chay thu 2, toan bo to dan pho/buoc phia sau bi LECH sang so dien thoai
// khac, khien findOrCreateUser tim NHAM tai khoan cua vai tro/to khac (dung
// coincidentally cung so) roi tai su dung sai - gay lon cac lien ket chu nha/
// chu ho/dai dien. Ham phoneFor() duoi day loai bo hoan toan rui ro nay: cung
// mot (slot, kind, seq) LUON cho ra cung mot so dien thoai bat ke thu tu duyet
// hay danh sach to dan pho co bao nhieu phan tu.
const NEIGHBORHOOD_SLOT: Record<string, number> = {
    "TDP-01": 1,
    "TDP-02": 2,
    "TDP-03": 3,
    "TDP-04-DUONGNOI": 4,
    "TDP-05": 5,
};
function slotForNeighborhood(code: string): number {
    const slot = NEIGHBORHOOD_SLOT[code];
    if (slot === undefined) {
        throw new Error(
            `Chua khai bao slot so dien thoai cho to dan pho "${code}" trong NEIGHBORHOOD_SLOT - ` +
                "them vao truoc khi chay script (tranh sinh so dien thoai khong on dinh).",
        );
    }
    return slot;
}
const PHONE_KIND = {
    ward: 0, // PCO cap phuong (khong gan voi to dan pho cu the)
    owner: 1,
    householdHeadDedicated: 2,
    businessRepDedicated: 3,
    companyRepDedicated: 4,
    orgRepresentative: 5,
    coleader: 6,
    collaborator: 7,
} as const;
function phoneFor(slot: number, kind: number, seq: number): string {
    return `08${slot}${kind}${String(seq).padStart(6, "0")}`;
}

async function main() {
    const { assertNotProtectedDatabase } = await import("@/lib/config");
    if (!process.env.MONGODB_URI) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }
    assertNotProtectedDatabase(process.env.MONGODB_URI);
    const { connectDB } = await import("@/lib/mongodb");
    await connectDB();

    const { hashPassword } = await import("@/lib/auth");
    const { HttpError } = await import("@/lib/response");
    const {
        User,
        Neighborhood,
        HouseRecord,
        Household,
        Citizen,
        Business,
        Company,
        PcccCheck,
        SecurityRecord,
        Request: RequestModel,
    } = await import("@/models");
    const { createHouseRecord } = await import("@/services/houseRecordService");
    const { createHousehold } = await import("@/services/householdService");
    const { createCitizen } = await import("@/services/citizenService");
    const { createBusiness } = await import("@/services/businessService");
    const { createCompany } = await import("@/services/companyService");
    const {
        assignNeighborhoodColeader,
        assignNeighborhoodCollaborator,
    } = await import("@/services/neighborhoodService");
    const { createPcccCheck } = await import("@/services/pcccService");
    const { createSecurityRecord } = await import("@/services/securityService");
    const {
        createRequest,
        updateMyRequestStatus,
        confirmRequestRecipient,
    } = await import("@/services/requestService");

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);

    const adminUserOrNull = await User.findOne({ roles: "admin" }).sort({
        createdAt: 1,
    });
    if (!adminUserOrNull) {
        throw new Error(
            "Khong tim thay tai khoan admin nao trong DB - can it nhat 1 admin de lam actor cho script nay",
        );
    }
    // Bien rieng, non-null - de TypeScript khong coi adminUser la "co the null"
    // trong cac closure/vong lap phia duoi (findOrCreateUser, createHouseRecord...).
    const adminUser: IUserDoc = adminUserOrNull;

    async function findOrCreateUser(opts: {
        displayName: string;
        phone: string;
        roles: string[];
        address?: string;
        email?: string;
    }): Promise<IUserDoc> {
        const existing = await User.findOne({ phone: opts.phone });
        if (existing) return existing;
        const created = await User.create({
            displayName: opts.displayName,
            phone: opts.phone,
            email: opts.email,
            address: opts.address,
            passwordHash,
            roles: opts.roles,
            primaryRole: opts.roles[0],
            status: "active",
            permissions: [],
            notificationPermission: true,
            sessionVersion: 0,
            wardCode: WARD_CODE,
            wardName: WARD_NAME,
            createdBy: adminUser._id,
        });
        console.log(`  [TAO MOI] ${opts.displayName} (${opts.roles.join(",")}) -> ${opts.phone}`);
        return created;
    }

    // -------------------------------------------------------------------
    // 1) Dam bao co du 5 to dan pho cho Duong Noi (doi chieu voi production,
    //    dev truoc day chi co TDP-01..03) - $setOnInsert, khong ghi de neu da co.
    //
    // LUU Y (phat hien luc chay script nay): DB dev hien con 2 index CU
    // (code_1, sequence_1) tu truoc khi schema doi sang khoa duy nhat theo
    // CUM {wardCode, code} (xem index moi trong models/Neighborhood.ts) -
    // code/sequence van dang bi ep DUY NHAT TREN TOAN BO collection thay vi
    // rieng theo tung phuong/xa. Vi da co mot to dan pho code="TDP-04"/
    // sequence=4 thuoc phuong/xa KHAC (du lieu thuc te), khong the tao them
    // "TDP-04"/sequence=4 cho Duong Noi cho den khi 2 index cu nay duoc go bo
    // (ngoai pham vi script nay - can quyet dinh rieng, co the anh huong du
    // lieu prod). Tam thoi dung code/sequence RIENG (khong trung voi bat ky
    // to dan pho nao dang co) cho phan tu thu 5 cua Duong Noi, thay vi
    // "TDP-04" nhu production.
    // -------------------------------------------------------------------
    const maxSequenceDoc = await Neighborhood.findOne()
        .sort({ sequence: -1 })
        .select("sequence");
    const safeSequence = (maxSequenceDoc?.sequence || 0) + 1;
    const MISSING_NEIGHBORHOODS = [
        { code: "TDP-05", name: "Tổ dân phố 05", sequence: 5 },
        {
            code: "TDP-04-DUONGNOI",
            name: "Tổ dân phố 04 (Dương Nội)",
            sequence: safeSequence,
        },
    ];
    for (const n of MISSING_NEIGHBORHOODS) {
        // Loc theo CA code VA wardCode - Neighborhood.code chi duy nhat TRONG
        // CUNG mot wardCode (partial unique index {wardCode,code} - xem
        // models/Neighborhood.ts), nen co the da co san mot to dan pho mang
        // dung code nay nhung thuoc phuong/xa KHAC (du lieu thuc te da chinh
        // sua) - neu chi loc theo {code} se tim nham va bo qua viec tao ban
        // ghi rieng cho Duong Noi.
        // eslint-disable-next-line no-await-in-loop
        await Neighborhood.findOneAndUpdate(
            { code: n.code, wardCode: WARD_CODE },
            {
                $setOnInsert: {
                    code: n.code,
                    name: n.name,
                    sequence: n.sequence,
                    wardCode: WARD_CODE,
                    wardName: WARD_NAME,
                    status: "ACTIVE",
                    active: true,
                },
            },
            { upsert: true, setDefaultsOnInsert: true },
        );
    }

    const neighborhoods = await Neighborhood.find({ wardCode: WARD_CODE }).sort({
        code: 1,
    });
    console.log(`\nTo dan pho Duong Noi (${neighborhoods.length}):`);
    neighborhoods.forEach(n => console.log(`  ${n.code} - ${n.name} (${n._id})`));
    if (neighborhoods.length === 0) {
        throw new Error("Khong tim thay to dan pho nao thuoc Duong Noi - dung lai");
    }

    // -------------------------------------------------------------------
    // 2) 2 tai khoan Can bo UBND (people_committee_official) cho phuong.
    // -------------------------------------------------------------------
    console.log("\n== Can bo UBND (PCO) ==");
    const pcoUsers: IUserDoc[] = [];
    for (let i = 1; i <= 2; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const pco = await findOrCreateUser({
            displayName: `Cán bộ UBND phường Dương Nội số ${i}`,
            phone: phoneFor(0, PHONE_KIND.ward, i),
            roles: ["people_committee_official"],
            address: "UBND phường Dương Nội",
        });
        pcoUsers.push(pco);
    }

    // -------------------------------------------------------------------
    // 3) Voi moi to dan pho: 8 nha so + 10 ho dan + 6 ho kinh doanh + 2 cong ty.
    // -------------------------------------------------------------------
    type NeighborhoodDemoData = {
        neighborhoodName: string;
        houseIds: string[];
        residentUserIds: string[]; // dung lam nguoi nhan Request mau da dang
    };
    const perNeighborhoodData: NeighborhoodDemoData[] = [];
    const allHouseIds: string[] = [];
    const allResidentUserIds: string[] = [];

    // Du lieu mau cho tinh trang dich benh (Household.diseaseStatus/diseaseName)
    // va nghe nghiep cua nhan khau phu (Citizen.occupation) - xem vong lap "10
    // ho dan" ben duoi.
    const DISEASE_STATUS_CYCLE: Array<{
        status: "recorded" | "monitoring" | "resolved";
        name: string;
    }> = [
        { status: "recorded", name: "Sốt xuất huyết" },
        { status: "monitoring", name: "Tay chân miệng" },
        { status: "resolved", name: "Cúm mùa" },
    ];
    const RESIDENT_OCCUPATIONS = [
        "Công nhân",
        "Giáo viên",
        "Kinh doanh tự do",
        "Nghỉ hưu",
        "Sinh viên",
        "Nội trợ",
        "Kỹ sư",
        "Nhân viên y tế",
        "Lái xe",
        "Thợ xây",
    ];

    for (const neighborhood of neighborhoods) {
        console.log(`\n== ${neighborhood.code} - ${neighborhood.name} ==`);
        const cluster = neighborhood.name;
        const slot = slotForNeighborhood(neighborhood.code);

        // 6 chu nha ca nhan - se duoc tai su dung lam chu ho/dai dien ho kinh
        // doanh/dai dien cong ty ben duoi, de mot nguoi vua so huu nha vua la
        // chu ho/chu ho kinh doanh cung luc.
        const individualOwners: IUserDoc[] = [];
        for (let i = 1; i <= INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const owner = await findOrCreateUser({
                displayName: `${neighborhood.name} - Chủ nhà ${i}`,
                phone: phoneFor(slot, PHONE_KIND.owner, i),
                roles: ["house_owner"],
                address: `${cluster}, phường Dương Nội`,
            });
            individualOwners.push(owner);
        }

        // 4 tai khoan chu ho "rieng" (khong so huu nha nao) de ho dan van co
        // truong hop chu ho khac voi chu nha, khong phai luc nao cung dung chung.
        const dedicatedHouseholdHeads: IUserDoc[] = [];
        for (let i = 1; i <= HOUSEHOLDS_PER_NEIGHBORHOOD - INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const head = await findOrCreateUser({
                displayName: `${neighborhood.name} - Chủ hộ riêng ${i}`,
                phone: phoneFor(slot, PHONE_KIND.householdHeadDedicated, i),
                roles: ["house_owner"],
                address: `${cluster}, phường Dương Nội`,
            });
            dedicatedHouseholdHeads.push(head);
        }

        // 3 tai khoan dai dien ho kinh doanh "rieng" (khong so huu nha nao).
        const dedicatedBusinessReps: IUserDoc[] = [];
        for (let i = 1; i <= BUSINESSES_PER_NEIGHBORHOOD - INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD / 2; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const rep = await findOrCreateUser({
                displayName: `${neighborhood.name} - Đại diện hộ KD riêng ${i}`,
                phone: phoneFor(slot, PHONE_KIND.businessRepDedicated, i),
                roles: ["house_owner"],
                address: `${cluster}, phường Dương Nội`,
            });
            dedicatedBusinessReps.push(rep);
        }

        // 1 tai khoan dai dien cong ty "rieng".
        const dedicatedCompanyRep = await findOrCreateUser({
            displayName: `${neighborhood.name} - Đại diện công ty riêng`,
            phone: phoneFor(slot, PHONE_KIND.companyRepDedicated, 1),
            roles: ["house_owner"],
            address: `${cluster}, phường Dương Nội`,
        });

        // --- 8 nha so: 6 chu ca nhan (tai su dung individualOwners[i]) + 2 chu
        // la to chuc (tao/tai su dung Organization qua taxCode co dinh theo
        // to dan pho, kem tai khoan dai dien tao inline boi houseRecordService).
        // createHouseRecord luon tao moi (khong tu dedup) - tu kiem tra truoc
        // theo `address` (duy nhat trong script nay) de idempotent khi chay lai.
        async function findOrCreateHouseByAddress(
            address: string,
            buildInput: () => Record<string, unknown>,
        ): Promise<string> {
            const existing = await HouseRecord.findOne({
                address,
                neighborhoodId: neighborhood._id,
            });
            if (existing) return String(existing._id);
            const house = await createHouseRecord(adminUser, buildInput() as any);
            return String(house._id);
        }

        const houseIds: string[] = [];
        for (let i = 0; i < INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD; i += 1) {
            const owner = individualOwners[i];
            const address = `Số ${10 + i}, ${cluster}, phường Dương Nội`;
            // eslint-disable-next-line no-await-in-loop
            const houseId = await findOrCreateHouseByAddress(address, () => ({
                cluster,
                neighborhoodId: String(neighborhood._id),
                address,
                usageTypes: ["household"],
                ownerKind: "individual",
                owner: { displayName: owner.displayName, phone: owner.phone as string },
                createOwnerAccount: true,
            }));
            houseIds.push(houseId);
        }
        for (let i = 0; i < ORG_OWNED_HOUSES_PER_NEIGHBORHOOD; i += 1) {
            const orgIndex = i + 1;
            const address = `Số ${20 + i}, ${cluster}, phường Dương Nội`;
            const repPhone = phoneFor(slot, PHONE_KIND.orgRepresentative, orgIndex);
            // eslint-disable-next-line no-await-in-loop
            const houseId = await findOrCreateHouseByAddress(address, () => ({
                cluster,
                neighborhoodId: String(neighborhood._id),
                address,
                usageTypes: ["business"],
                ownerKind: "organization",
                organization: {
                    name: `Công ty TNHH ${neighborhood.code} Số ${orgIndex}`,
                    taxCode: `DEMO-${neighborhood.code}-ORG-${orgIndex}`,
                },
                createRepresentativeAccount: true,
                representative: {
                    displayName: `${neighborhood.name} - Đại diện tổ chức ${orgIndex}`,
                    phone: repPhone,
                    password: DEFAULT_PASSWORD,
                },
            }));
            houseIds.push(houseId);
        }
        console.log(`  Nha so: ${houseIds.length}`);

        // --- 10 ho dan: 6 dung chung voi chu nha ca nhan, 4 co chu ho rieng. Da
        // dang hoa them cac trang thai dac biet (needsSupport/isNearPoor/
        // isMartyrFamilyHousehold/isLonelyElderly) va tinh trang dich benh
        // (diseaseStatus/diseaseName) de co du lieu mau cho danh sach "Xuat
        // danh sach theo doi dich benh" va cac bo loc trang thai ho dan. Moi ho
        // dan co THEM 1 nhan khau phu (ngoai chu ho tu dong tao boi
        // createHousehold) voi nghe nghiep/loai cu tru/tinh trang khai bao cu
        // tru da dang.
        // Idempotent: kiem tra theo `address` (duy nhat trong script nay) truoc
        // khi goi createHousehold, tuong tu nha so o tren; nhan khau phu kiem
        // tra theo `householdId` + `fullName`.
        let residentsCreated = 0;
        for (let i = 0; i < HOUSEHOLDS_PER_NEIGHBORHOOD; i += 1) {
            const houseId = houseIds[i % houseIds.length];
            const headUser =
                i < INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD
                    ? individualOwners[i]
                    : dedicatedHouseholdHeads[i - INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD];
            const address = `Hộ dân số ${i + 1}, ${cluster}`;
            // Chi 3/10 ho co ghi nhan dich benh (i < do dai DISEASE_STATUS_CYCLE),
            // con lai giu "none" (mac dinh) - tranh moi ho deu "dang co dich
            // benh" khong thuc te.
            const disease = DISEASE_STATUS_CYCLE[i % DISEASE_STATUS_CYCLE.length];
            const hasDisease = i < DISEASE_STATUS_CYCLE.length;
            // eslint-disable-next-line no-await-in-loop
            let household: any = await Household.findOne({ address, houseId });
            if (!household) {
                // eslint-disable-next-line no-await-in-loop
                household = (await createHousehold(adminUser, {
                    cluster,
                    address,
                    headOfHousehold: headUser.displayName,
                    headOfHouseholdUserId: String(headUser._id),
                    houseId,
                    needsSupport: i % 5 === 0,
                    isNearPoor: i % 4 === 0,
                    isMartyrFamilyHousehold: i === 2,
                    isLonelyElderly: i === 3,
                    diseaseStatus: hasDisease ? disease.status : "none",
                    diseaseName: hasDisease ? disease.name : undefined,
                } as any)) as any;
            }

            const residentName = `Nhân khẩu bổ sung ${i + 1}, ${cluster}`;
            // eslint-disable-next-line no-await-in-loop
            const existingResident = await Citizen.findOne({
                householdId: household._id,
                fullName: residentName,
            });
            if (!existingResident) {
                const isTamTru = i % 3 === 0;
                // eslint-disable-next-line no-await-in-loop
                await createCitizen(adminUser, {
                    fullName: residentName,
                    gender: i % 2 === 0 ? "nam" : "nu",
                    relationToHead: "Thành viên hộ",
                    occupation: RESIDENT_OCCUPATIONS[i % RESIDENT_OCCUPATIONS.length],
                    householdId: String(household._id),
                    residenceType: isTamTru ? "tam_tru" : "thuong_tru",
                    temporaryResidenceStartsAt: isTamTru
                        ? new Date(Date.UTC(2026, 0, 1 + i)).toISOString()
                        : undefined,
                    temporaryResidenceExpiresAt: isTamTru
                        ? new Date(Date.UTC(2026, 6, 1 + i)).toISOString()
                        : undefined,
                    // Xen ke da/chua khai bao cu tru de co du lieu mau ca 2
                    // trang thai (xem Citizen.isResidencyDeclared).
                    isResidencyDeclared: i % 2 === 0,
                } as any);
                residentsCreated += 1;
            }
        }
        console.log(
            `  Ho dan: ${HOUSEHOLDS_PER_NEIGHBORHOOD} (nhan khau phu moi tao: ${residentsCreated})`,
        );

        // --- 6 ho kinh doanh: 3 dung chung voi chu nha ca nhan, 3 co dai dien rieng.
        // Idempotent: kiem tra theo `name` (duy nhat trong script nay) truoc
        // khi goi createBusiness.
        for (let i = 0; i < BUSINESSES_PER_NEIGHBORHOOD; i += 1) {
            const houseId = houseIds[i % houseIds.length];
            const halfPoint = Math.ceil(BUSINESSES_PER_NEIGHBORHOOD / 2);
            const repUser =
                i < halfPoint
                    ? individualOwners[i % individualOwners.length]
                    : dedicatedBusinessReps[i - halfPoint];
            const name = `Hộ kinh doanh ${neighborhood.code} số ${i + 1}`;
            // eslint-disable-next-line no-await-in-loop
            const existingBusiness = await Business.findOne({ name, houseId });
            if (!existingBusiness) {
                // eslint-disable-next-line no-await-in-loop
                await createBusiness(adminUser, {
                    name,
                    houseId,
                    ownerName: repUser.displayName,
                    representativeUserId: String(repUser._id),
                    active: true,
                } as any);
            }
        }
        console.log(`  Ho kinh doanh: ${BUSINESSES_PER_NEIGHBORHOOD}`);

        // --- 2 cong ty, moi cong ty gan voi 1 trong 2 nha thuoc to chuc ben tren.
        // Idempotent: kiem tra theo `name` truoc khi goi createCompany.
        const orgOwnedHouseIds = houseIds.slice(
            INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD,
            INDIVIDUAL_OWNERS_PER_NEIGHBORHOOD + ORG_OWNED_HOUSES_PER_NEIGHBORHOOD,
        );
        for (let i = 0; i < COMPANIES_PER_NEIGHBORHOOD; i += 1) {
            const houseId = orgOwnedHouseIds[i] || houseIds[i];
            const repUser = i === 0 ? individualOwners[0] : dedicatedCompanyRep;
            const name = `Công ty ${neighborhood.code} số ${i + 1}`;
            // eslint-disable-next-line no-await-in-loop
            const existingCompany = await Company.findOne({ name, houseId });
            if (existingCompany) continue;
            // eslint-disable-next-line no-await-in-loop
            await createCompany(adminUser, {
                name,
                houseId,
                ownerName: repUser.displayName,
                representativeUserId: String(repUser._id),
                active: true,
            } as any);
        }
        console.log(`  Cong ty: ${COMPANIES_PER_NEIGHBORHOOD}`);

        allHouseIds.push(...houseIds);
        const residentIds = [
            ...individualOwners.map(u => String(u._id)),
            ...dedicatedHouseholdHeads.map(u => String(u._id)),
            ...dedicatedBusinessReps.map(u => String(u._id)),
            String(dedicatedCompanyRep._id),
        ];
        allResidentUserIds.push(...residentIds);
        perNeighborhoodData.push({
            neighborhoodName: neighborhood.name,
            houseIds,
            residentUserIds: residentIds,
        });
    }

    // -------------------------------------------------------------------
    // 4) Voi moi to dan pho: 1 to pho + 2 cong tac vien (dung 2 nha so dau tien
    //    cua chinh to do lam pham vi HOUSE_GROUP cho cong tac vien).
    // -------------------------------------------------------------------
    console.log("\n== To pho & Cong tac vien ==");
    const coleaderUsers: IUserDoc[] = [];
    for (let idx = 0; idx < neighborhoods.length; idx += 1) {
        const neighborhood = neighborhoods[idx];
        const data = perNeighborhoodData[idx];
        const slot = slotForNeighborhood(neighborhood.code);

        const coleader = await findOrCreateUser({
            displayName: `${neighborhood.name} - Tổ phó`,
            phone: phoneFor(slot, PHONE_KIND.coleader, 1),
            roles: ["neighborhood_coleader"],
            address: `${neighborhood.name}, phường Dương Nội`,
        });
        coleaderUsers.push(coleader);
        await assignNeighborhoodColeader(
            String(adminUser._id),
            String(neighborhood._id),
            String(coleader._id),
            "Gan tu script seed demo",
        );

        for (let c = 1; c <= 2; c += 1) {
            // eslint-disable-next-line no-await-in-loop
            const collaborator = await findOrCreateUser({
                displayName: `${neighborhood.name} - Cộng tác viên ${c}`,
                phone: phoneFor(slot, PHONE_KIND.collaborator, c),
                roles: ["neighborhood_collaborator"],
                address: `${neighborhood.name}, phường Dương Nội`,
            });
            // Idempotent tren lan chay lai: assignNeighborhoodCollaborator nem
            // HttpError(409) neu chinh cong tac vien nay da co phan cong
            // HOUSE_GROUP active cho to dan pho nay (duplicateFilter khong xet
            // theo houseIds cu the) - coi la "da gan roi", bo qua, khac loi khac.
            try {
                // eslint-disable-next-line no-await-in-loop
                await assignNeighborhoodCollaborator(
                    String(adminUser._id),
                    String(neighborhood._id),
                    {
                        collaboratorUserId: String(collaborator._id),
                        scopeType: "HOUSE_GROUP",
                        houseIds: data.houseIds.slice(0, 2),
                    } as any,
                );
            } catch (err) {
                if (!(err instanceof HttpError) || err.status !== 409) throw err;
            }
        }
        console.log(`  ${neighborhood.code}: to pho + 2 cong tac vien OK`);
    }

    // -------------------------------------------------------------------
    // 5) 15 ban ghi PCCC - muc do (xanh/vang/do) va tinh trang theo doi khac
    //    nhau, rai deu tren cac nha so vua tao.
    // -------------------------------------------------------------------
    console.log("\n== PCCC ==");
    const RISK_LEVELS = ["xanh", "vang", "do"] as const;
    const PCCC_FOLLOWUP = ["chua_khac_phuc", "dang_khac_phuc", "da_khac_phuc"] as const;
    for (let i = 0; i < TOTAL_PCCC; i += 1) {
        const houseId = allHouseIds[i % allHouseIds.length];
        const riskLevel = RISK_LEVELS[i % RISK_LEVELS.length];
        const followUpStatus = PCCC_FOLLOWUP[Math.floor(i / RISK_LEVELS.length) % PCCC_FOLLOWUP.length];
        const note = `Kiem tra PCCC demo #${i + 1}`;
        // Idempotent: `note` duy nhat trong script nay dung lam khoa dedup -
        // createPcccCheck luon tao moi (mot nha co the co nhieu lan kiem tra
        // thuc te), khong tu tranh trung nhu cac service khac o tren.
        // eslint-disable-next-line no-await-in-loop
        const existingPccc = await PcccCheck.findOne({ note });
        if (existingPccc) continue;
        // eslint-disable-next-line no-await-in-loop
        await createPcccCheck(adminUser, {
            houseId,
            hasFireExtinguisher: i % 2 === 0,
            hasEmergencyExit: i % 3 !== 0,
            hasIndoorEvCharging: i % 4 === 0,
            hasGasStoveOrStorageOrBusiness: i % 2 === 1,
            isCrowdedRental: i % 5 === 0,
            riskLevel,
            note,
            inspectionDate: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
            followUpStatus,
        } as any);
    }
    console.log(`  Da tao/kiem tra ${TOTAL_PCCC} ban ghi PCCC`);

    // -------------------------------------------------------------------
    // 6) 15 ban ghi An ninh - muc do va tinh trang theo doi khac nhau.
    // -------------------------------------------------------------------
    console.log("\n== An ninh ==");
    const SECURITY_LEVELS = ["binh_thuong", "can_theo_doi", "khan_cap"] as const;
    const SECURITY_MONITORING = [
        "binh_thuong",
        "dang_theo_doi",
        "da_bao_cong_an",
        "da_ket_thuc",
    ] as const;
    for (let i = 0; i < TOTAL_SECURITY; i += 1) {
        const houseId = allHouseIds[(i + TOTAL_PCCC) % allHouseIds.length];
        const level = SECURITY_LEVELS[i % SECURITY_LEVELS.length];
        const monitoringStatus =
            SECURITY_MONITORING[Math.floor(i / SECURITY_LEVELS.length) % SECURITY_MONITORING.length];
        const note = `Kiem tra an ninh demo #${i + 1}`;
        // eslint-disable-next-line no-await-in-loop
        const existingSecurity = await SecurityRecord.findOne({ note });
        if (existingSecurity) continue;
        // eslint-disable-next-line no-await-in-loop
        await createSecurityRecord(adminUser, {
            houseId,
            hasCamera: i % 2 === 0,
            hasSecurityComplaint: i % 3 === 0,
            level,
            reportedToPolice: monitoringStatus === "da_bao_cong_an",
            monitoringStatus,
            note,
            inspectionDate: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        } as any);
    }
    console.log(`  Da tao ${TOTAL_SECURITY} ban ghi An ninh`);

    // -------------------------------------------------------------------
    // 7) 25 Request - nguoi gui/nguoi nhan khac nhau, trai deu 6 trang thai
    //    qua dung luong chuyen trang thai (updateMyRequestStatus/confirmRequestRecipient),
    //    KHONG ghi truc tiep vao RequestRecipient.status.
    //
    // Luu y quan trong ve loai Request (xem requestService.resolveRecipientIds/
    // eligiblePermissionForType): targetUserIds/targetRoles CHI hop le neu
    // nguoi nhan co role nam trong danh sach co quyen "{type}.assign":
    //   - "other.assign": chi neighborhood_leader/neighborhood_coleader.
    //   - "pccc.assign"/"security.assign": chi regional_police.
    //   - "task.assign": KHONG co role nao ca - loai "task" CHI gui duoc qua
    //     kenh houseId+houseRole (resolveHouseRoleRecipientIds), nguoi nhan la
    //     chinh chu nha/chu ho/dai dien ho KD/dai dien cong ty TAI nha do, do
    //     server tu resolve, khong phai targetUserIds. Day cung la kenh DUY
    //     NHAT de gui Request cho cu dan (house_owner) trong script nay.
    // Nen dung xen ke 2 loai: "task" (nguoi gui = to pho, nguoi nhan = cu dan
    // tai mot nha cu the) va "other" (nguoi gui = admin/PCO, nguoi nhan = to
    // pho) - bo qua "pccc"/"security" vi can tai khoan regional_police rieng
    // ma script nay khong tao (ban ghi PCCC/An ninh thuc te da duoc tao rieng
    // o buoc 5/6 qua dung service, khong can Request de lam dieu do).
    // -------------------------------------------------------------------
    console.log("\n== Request ==");
    const HOUSE_ROLE_CYCLE: Array<{
        houseRole: "house_owner" | "household_head" | "business_head" | "company_rep";
        houseIndex: number;
    }> = [
        { houseRole: "house_owner", houseIndex: 0 },
        { houseRole: "household_head", houseIndex: 1 },
        { houseRole: "business_head", houseIndex: 2 },
        { houseRole: "company_rep", houseIndex: 6 },
    ];
    let resolvedCount = 0;
    let awaitingCount = 0;
    let needsInfoCount = 0;
    let inProgressCount = 0;
    let acknowledgedCount = 0;
    let pendingCount = 0;
    for (let i = 0; i < TOTAL_REQUESTS; i += 1) {
        const useTaskType = i % 2 === 0;
        const type = useTaskType ? "task" : "other";
        const title = `Yêu cầu demo #${i + 1} (${type})`;

        // Idempotent: bo qua ca cum tao+chuyen trang thai neu Request voi
        // `title` nay (duy nhat trong script nay) da ton tai tu lan chay truoc.
        // eslint-disable-next-line no-await-in-loop
        const existingRequest = await RequestModel.findOne({ title });
        if (existingRequest) {
            const slot = i % 6;
            if (slot === 0) pendingCount += 1;
            else if (slot === 1) acknowledgedCount += 1;
            else if (slot === 2) inProgressCount += 1;
            else if (slot === 3) needsInfoCount += 1;
            else if (slot === 4) awaitingCount += 1;
            else resolvedCount += 1;
            continue;
        }

        let creator: IUserDoc;
        let recipientId: string;
        let requestId: string;
        if (useTaskType) {
            const neighborhoodIdx = i % neighborhoods.length;
            const houseIds = perNeighborhoodData[neighborhoodIdx].houseIds;
            const { houseRole, houseIndex } =
                HOUSE_ROLE_CYCLE[Math.floor(i / 2) % HOUSE_ROLE_CYCLE.length];
            creator = coleaderUsers[neighborhoodIdx];
            // eslint-disable-next-line no-await-in-loop
            const request = await createRequest(creator, {
                type,
                title,
                description: `Yeu cau seed demo so ${i + 1}`,
                priority: "normal",
                targetUserIds: [],
                targetRoles: [],
                houseId: houseIds[houseIndex],
                houseRole,
            } as any);
            requestId = String((request as any)._id);
            recipientId = String((request as any).recipients[0].userId);
        } else {
            creator = pcoUsers[i % pcoUsers.length];
            const recipient = coleaderUsers[i % coleaderUsers.length];
            recipientId = String(recipient._id);
            // eslint-disable-next-line no-await-in-loop
            const request = await createRequest(creator, {
                type,
                title,
                description: `Yeu cau seed demo so ${i + 1}`,
                priority: "normal",
                targetUserIds: [recipientId],
                targetRoles: [],
            } as any);
            requestId = String((request as any)._id);
        }

        const statusSlot = i % 6;
        if (statusSlot === 0) {
            pendingCount += 1; // giu nguyen "pending" - khong goi gi them
        } else if (statusSlot === 1) {
            // eslint-disable-next-line no-await-in-loop
            await updateMyRequestStatus(recipientId, requestId, {
                status: "acknowledged",
            } as any);
            acknowledgedCount += 1;
        } else if (statusSlot === 2) {
            // eslint-disable-next-line no-await-in-loop
            await updateMyRequestStatus(recipientId, requestId, {
                status: "in_progress",
            } as any);
            inProgressCount += 1;
        } else if (statusSlot === 3) {
            // eslint-disable-next-line no-await-in-loop
            await updateMyRequestStatus(recipientId, requestId, {
                status: "needs_info",
                note: "Cần bổ sung thông tin xác minh trước khi xử lý tiếp.",
            } as any);
            needsInfoCount += 1;
        } else if (statusSlot === 4) {
            // eslint-disable-next-line no-await-in-loop
            await updateMyRequestStatus(recipientId, requestId, {
                status: "awaiting_confirmation",
            } as any);
            awaitingCount += 1;
        } else {
            // eslint-disable-next-line no-await-in-loop
            await updateMyRequestStatus(recipientId, requestId, {
                status: "awaiting_confirmation",
            } as any);
            // eslint-disable-next-line no-await-in-loop
            await confirmRequestRecipient(
                creator,
                requestId,
                recipientId,
                "resolved",
                "Đã xác nhận hoàn thành (demo).",
            );
            resolvedCount += 1;
        }
    }
    console.log(
        `  Da tao ${TOTAL_REQUESTS} Request - pending:${pendingCount} acknowledged:${acknowledgedCount} in_progress:${inProgressCount} needs_info:${needsInfoCount} awaiting_confirmation:${awaitingCount} resolved:${resolvedCount}`,
    );

    console.log("\n==============================================");
    console.log(`Mat khau dang nhap chung cho tai khoan moi tao: ${DEFAULT_PASSWORD}`);
    console.log("==============================================");

    const mongoose = (await import("mongoose")).default;
    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Seed demo Duong Noi that bai:", err);
    process.exit(1);
});
