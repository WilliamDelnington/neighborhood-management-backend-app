import type { Types } from "mongoose";
import {
    HouseRecord,
    Household,
    Business,
    Company,
    Organization,
    Neighborhood,
    Person,
    User,
    type IHouseRecord,
    type INeighborhood,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateSequentialCode } from "@/lib/utils";
import { hashPassword } from "@/lib/auth";

// Danh sach truong duoc coi la "dinh danh/dia chi" cua nha so - mot khi ho so
// da "verified", nhung truong nay khong con sua truc tiep duoc nua (phai gui
// ChangeRequest, xem changeRequestService.ts). Cac truong con lai (vd
// physicalStatus, note) van sua tu do bat ke trang thai xac minh - xem ghi
// chu trong validators/houseRecord.ts.
export const HOUSE_RECORD_PROTECTED_FIELDS = [
    "address",
    "cluster",
    "streetId",
    "neighborhoodId",
    "provinceCode",
    "provinceName",
    "wardCode",
    "wardName",
    "usageTypes",
    "otherUsageNote",
    "residenceDeclarationNumber",
];
import { clusterScopeFilter, areaScopeFilter, userHasPermission } from "@/lib/rbac";
import { resolveClusterForStreet, resolveStreetClusterPair } from "@/lib/streetSync";
import { writeAuditLog } from "@/services/auditService";
import { createNotification } from "@/services/notificationService";
import {
    createInitialOwnership,
    deleteAllOwnershipsForHouse,
    getHouseIdsForActingOwner,
    isHouseOwnerActor,
    resolveActiveHouseOwnerActingUserIds,
    syncPrimaryOwnershipVerification,
} from "@/services/houseOwnershipService";
import { addOrganizationRepresentative } from "@/services/organizationRepresentativeService";
import {
    HOUSE_RECORD_STATUS_LABEL,
    type HouseRecordStatus,
    type HouseGisSource,
    type HouseUsageType,
    type OwnerType,
    type VerificationStatus,
} from "@/types";
import type {
    CreateHouseRecordInput,
    CreateHouseRecordOwnerInput,
    UpdateHouseRecordInput,
} from "@/validators/houseRecord";

const HOUSE_RECORD_POPULATE = [
    { path: "streetId", select: "name code" },
    { path: "neighborhoodId", select: "name code" },
];

type HouseGisInput = {
    gisLatitude?: number | null;
    gisLongitude?: number | null;
    gisAccuracyMeters?: number | null;
    gisSource?: HouseGisSource;
    gisCapturedAt?: string | null;
};

/**
 * Chuan hoa toa do client/mobile thanh du lieu GIS noi bo. Theo quy uoc trien
 * khai hien tai, null/undefined/0 nghia la chua co du lieu; tuyet doi khong
 * dua [0, 0] vao chi muc 2dsphere. Khi co toa do that, luu dong thoi cac
 * truong phang va GeoJSON [longitude, latitude] de san sang cho ban do/API.
 */
function normalizeHouseGis(input: HouseGisInput) {
    const latitude = input.gisLatitude;
    const longitude = input.gisLongitude;
    const unavailable =
        latitude === undefined ||
        latitude === null ||
        longitude === undefined ||
        longitude === null ||
        latitude === 0 ||
        longitude === 0;

    if (unavailable) {
        return {
            gisLatitude: null,
            gisLongitude: null,
            gisAccuracyMeters: null,
            gisSource: "unavailable" as const,
            gisCapturedAt: null,
            location: undefined,
        };
    }

    return {
        gisLatitude: latitude,
        gisLongitude: longitude,
        gisAccuracyMeters: input.gisAccuracyMeters ?? null,
        gisSource:
            input.gisSource && input.gisSource !== "unavailable"
                ? input.gisSource
                : ("manual" as const),
        gisCapturedAt: input.gisCapturedAt
            ? new Date(input.gisCapturedAt)
            : new Date(),
        location: {
            type: "Point" as const,
            coordinates: [longitude, latitude] as [number, number],
        },
    };
}

/**
 * Nha co Ho dan/Ho kinh doanh/Cong ty da khai bao thuc te thi PHAI duoc coi la
 * co muc dich su dung tuong ung (living/business/company), bat ke chu nha co
 * tick khai bao truoc hay khong - tranh truong hop nha thuc te da co ho kinh
 * doanh nhung usageTypes chi ghi "household" (vd du lieu cu tu truoc khi co
 * tinh nang nay, hoac chu nha khai bao thieu). Gop (union) voi usageTypes da
 * luu, KHONG ghi de/mat gia tri da khai bao (vd nha khai bao "company" nhung
 * chua tao Company nao van giu nguyen de con canh bao khai bao thieu - xem
 * HouseDetailPage.tsx). Chi tinh toan de tra ve, khong luu lai vao DB.
 */
async function withInferredUsageTypes(
    houseRecord: IHouseRecord,
): Promise<IHouseRecord> {
    const [hasHousehold, hasBusiness, hasCompany] = await Promise.all([
        Household.exists({ houseId: houseRecord._id }),
        Business.exists({ houseId: houseRecord._id }),
        Company.exists({ houseId: houseRecord._id }),
    ]);
    const inferred: HouseUsageType[] = [];
    if (hasHousehold) inferred.push("household");
    if (hasBusiness) inferred.push("business");
    if (hasCompany) inferred.push("company");
    const merged = Array.from(
        new Set([...(houseRecord.usageTypes || []), ...inferred]),
    );
    houseRecord.usageTypes = merged.length ? merged : ["household"];
    return houseRecord;
}

/**
 * Nem HttpError(403) neu actor khong phai admin va cluster truyen vao khong
 * nam trong assignedClusters cua actor - dung khi tao/doi cluster cua nha so.
 * House_owner khong co assignedClusters va khong phai nhan vien nen duoc bo
 * qua kiem tra nay (ho tu khai bao cum dan cu cua minh khi tu dang ky nha so).
 */
function assertClusterAssignable(actorUser: IUser, cluster: string): void {
    if (actorUser.roles.includes("admin") || actorUser.roles.includes("house_owner")) {
        return;
    }
    if (!actorUser.assignedClusters?.includes(cluster)) {
        throw new HttpError(
            "Cụm dân cư không thuộc phạm vi quản lý của bạn",
            403,
        );
    }
}

/**
 * Tra ve chuoi id cua mot truong tham chieu (vd houseRecord.neighborhoodId),
 * du truong do dang la ObjectId "tho" hay da duoc .populate() thanh document
 * con (co _id) - String(populatedDoc) se ra "[object Object]" chu khong phai
 * id, khien moi so sanh id deu that bai mot cach am tham.
 */
function refIdToString(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
        return String((value as { _id: unknown })._id);
    }
    return String(value);
}

/**
 * Nem HttpError(403) neu user khong duoc phep thao tac voi nha so nay:
 * - admin: luon duoc phep.
 * - nguoi dang thao tac thay chu nha (primary_owner/co_owner/authorized_manager
 *   - xem isHouseOwnerActor o houseOwnershipService.ts, bao gom ca truong hop
 *   dai dien to chuc chu nha): luon duoc phep voi nha cua minh.
 * - house_owner khac (khong phai chu nha nay): khong bao gio duoc phep.
 * - nhan vien (to truong, bi thu, cong an, can bo UBND): theo assignedClusters
 *   nhu truoc (rong neu khong duoc gan cum cu the).
 */
export async function assertHouseRecordInScope(
    user: IUser,
    houseRecord: IHouseRecord,
): Promise<void> {
    if (user.roles.includes("admin")) return;
    if (await isHouseOwnerActor(houseRecord._id, user._id)) {
        return;
    }
    // Mot nguoi co the VUA la chu nha (o mot to khac) VUA la To truong/To pho -
    // kiem tra scope To truong TRUOC khi tu choi theo house_owner, thay vi
    // tu choi ngay khi co role house_owner (truoc day se chan ca cac nha
    // trong chinh to dan pho ho phu trach, chi vi ho cung so huu mot nha khac
    // o noi khac).
    const isLeaderOrColeader =
        user.roles.includes("neighborhood_leader") ||
        user.roles.includes("neighborhood_coleader");
    if (isLeaderOrColeader) {
        const ids = [user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])]
            .filter(Boolean)
            .map(String);
        const houseNeighborhoodId = refIdToString(houseRecord.neighborhoodId);
        if (houseNeighborhoodId && ids.includes(houseNeighborhoodId)) {
            return;
        }
    }
    if (user.roles.includes("house_owner") && !isLeaderOrColeader) {
        throw new HttpError(
            "Bạn không có quyền thao tác với nhà số của người khác",
            403,
        );
    }
    if (isLeaderOrColeader) {
        throw new HttpError(
            "Bạn không có quyền thao tác với nhà số ngoài tổ dân phố được phân công",
            403,
        );
    }
    if (
        user.assignedClusters?.length &&
        !user.assignedClusters.includes(houseRecord.cluster)
    ) {
        throw new HttpError(
            "Bạn không có quyền thao tác với nhà số ngoài cụm được phân công",
            403,
        );
    }
}

/**
 * Nem HttpError(403) neu nha so chua duoc xac thuc (status khac "verified")
 * va actor khong phai admin - dung truoc khi them Household/Citizen vao mot
 * nha so, de tranh dang ky ho dan/nhan khau vao nha con dang cho duyet, bi
 * tu choi, hoac chua nop duyet lan nao (rui ro trung lap/gia mao dia chi).
 * Admin luon duoc bo qua, giong cac kiem tra status khac trong file nay.
 */
export function assertHouseRecordVerifiedForMembers(
    actorUser: IUser,
    houseRecord: IHouseRecord,
): void {
    if (actorUser.roles.includes("admin")) return;
    if (houseRecord.status !== "verified") {
        throw new HttpError(
            "Nhà số chưa được xác thực, chưa thể thêm hộ dân hoặc nhân khẩu",
            403,
        );
    }
}

/**
 * Nem HttpError(403) neu nha so dang o trang thai khong cho phep khai bao
 * Household/Business moi ("denied"/"locked") va actor khong phai admin. Khac
 * assertHouseRecordVerifiedForMembers o tren: cho tao ngay ke ca khi nha con
 * "unverified" (chua tung gui duyet) hoac "pending" (dang cho duyet) - ban ghi
 * tao ra se o trang thai "unverified" cho toi khi nha so duoc xac thuc (xem
 * resolveInitialVerificationStatus va createHousehold/createBusiness).
 */
export function assertHouseRecordAllowsDeclaration(
    actorUser: IUser,
    houseRecord: IHouseRecord,
): void {
    if (actorUser.roles.includes("admin")) return;
    if (["denied", "locked"].includes(houseRecord.status)) {
        throw new HttpError(
            "Nhà số đã bị từ chối hoặc đã bị khóa, chưa thể khai báo hộ dân hoặc hộ kinh doanh",
            403,
        );
    }
}

/**
 * Tra ve trang thai xac thuc ban dau ("unverified"/"pending") de gan cho mot
 * Household/Business moi tao duoi houseRecord - "pending" ngay tu luc tao neu
 * nha so cha da "verified" (bo qua buoc "unverified" vi cascade cua
 * transitionHouseRecordStatus se lam dieu nay ngay sau do neu tao truoc), con
 * lai luon "unverified" (bao gom ca truong hop admin tao duoi nha "denied"/
 * "locked" - assertHouseRecordAllowsDeclaration da bo qua kiem tra cho admin
 * nhung ban ghi tao ra van phai cho nha so duoc xac thuc rieng). Khong co
 * houseId (ho dan/ho kinh doanh "mo coi") thi khong co nha nao de cho -
 * "unverified", cho xac thuc thu cong rieng sau nay (xem
 * transitionHouseholdStatus/transitionBusinessStatus).
 */
export function resolveInitialVerificationStatus(
    houseRecord: IHouseRecord | null | undefined,
): VerificationStatus {
    if (!houseRecord) return "unverified";
    return houseRecord.status === "verified" ? "pending" : "unverified";
}

/**
 * Nem HttpError(403) neu status hien tai cua Household/Business khong cho
 * phep chinh sua ("verified"/"denied"/"locked") va actor khong phai admin -
 * dung boi householdService.updateHousehold/businessService.updateBusiness.
 * Chi "unverified"/"pending" duoc sua truc tiep - sau khi da xac thuc (hoac bi
 * tu choi/khoa), phai qua admin.
 */
export function assertVerificationEditable(
    actorUser: IUser,
    status: VerificationStatus,
    label: string,
): void {
    if (actorUser.roles.includes("admin")) return;
    if (!["unverified", "pending"].includes(status)) {
        throw new HttpError(
            `${label} đã được xác thực, bị từ chối hoặc đã bị khóa, không thể chỉnh sửa`,
            403,
        );
    }
}

/**
 * Nem HttpError(403) neu nha so da "verified" VA actor dang thao tac thay chu
 * nha (xem isHouseOwnerActor o houseOwnershipService.ts) - dung truoc khi cap
 * token/luu tep dinh kem moi cho HouseRecord, de chu nha khong the tu y them
 * tep sau khi ho so da duoc xac thuc (phai lien he nhan vien/gui yeu cau thay
 * doi thong tin thay vi tu them). Nhan vien giu quyen "houses.update"/
 * "houses.verify" (khong phai chu nha) KHONG bi anh huong boi kiem tra nay -
 * ho van duoc them tep dinh kem sau khi xac thuc nhu binh thuong.
 */
export async function assertHouseOwnerAttachmentUploadAllowed(
    actorUser: IUser,
    houseRecord: IHouseRecord,
): Promise<void> {
    if (houseRecord.status !== "verified") return;
    if (await isHouseOwnerActor(houseRecord._id, actorUser._id)) {
        throw new HttpError(
            "Nhà đã được xác thực, chủ nhà không thể thêm tệp đính kèm",
            403,
        );
    }
}

/**
 * Dieu kien loc danh sach nha so theo pham vi cua actor:
 * - admin: xem tat ca.
 * - house_owner: chi xem nha so ma minh dang thao tac thay chu nha - truc
 *   tiep, qua to chuc ma minh la nguoi dai dien, hoac voi vai tro co_owner/
 *   authorized_manager (xem getHouseIdsForActingOwner o houseOwnershipService.ts)
 *   - KHONG duoc roi vao nhanh clusterScopeFilter vi house_owner luon co
 *   assignedClusters rong -> se bi hieu nham la "khong gioi han" (xem duoc
 *   toan bo phuong) neu dung chung logic voi nhan vien.
 * - nhan vien: nhu truoc, theo assignedClusters (rong = xem toan phuong).
 */
async function houseRecordScopeFilter(
    user: IUser,
): Promise<Record<string, unknown>> {
    if (user.roles.includes("admin")) return {};
    if (user.roles.includes("house_owner")) {
        const houseIds = await getHouseIdsForActingOwner(user._id);
        return { _id: { $in: houseIds } };
    }
    return areaScopeFilter(user);
}

/**
 * Nem HttpError(404) neu neighborhoodId duoc chon khong ton tai - to dan pho
 * gan truc tiep vao tung nha so (khong suy ra tu Street, vi mot duong/pho co
 * the chay qua nhieu to dan pho). Tra ve doc Neighborhood (hoac undefined neu
 * khong truyen neighborhoodId) de goi noi dung luon lay wardCode/provinceCode
 * cua no - moi Neighborhood gio bat buoc thuoc ve mot phuong/xa (xem
 * models/Neighborhood.ts), nen phuong/xa cua nha so PHAI khop voi to dan pho
 * da chon (khac Street - mot duong/pho co the chay qua nhieu to dan pho nen
 * khong suy ra duoc quan he nao).
 */
async function resolveNeighborhoodForHouse(
    neighborhoodId?: string | null,
): Promise<INeighborhood | undefined> {
    if (!neighborhoodId) return undefined;
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) {
        throw new HttpError("Không tìm thấy tổ dân phố", 404);
    }
    return neighborhood;
}

/**
 * Tra ve phuong/xa + tinh/thanh pho thuc su se luu vao nha so: neu co chon to
 * dan pho, LUON lay tu chinh to dan pho do (ghi de bat ky provinceCode/wardCode
 * nao client gui kem - to dan pho la nguon "su that" khi da chon, tranh sai
 * lech du lieu neu client gui nham); neu khong chon to dan pho, dung nguyen
 * provinceCode/wardCode client tu nhap (truc thoi lap voi neighborhoodId,
 * giong cach Street doc lap voi Neighborhood).
 */
function resolveAdministrativeDivisions(
    neighborhood: INeighborhood | undefined,
    input: {
        provinceCode?: number;
        provinceName?: string;
        wardCode?: number;
        wardName?: string;
    },
) {
    if (neighborhood) {
        return {
            provinceCode: neighborhood.provinceCode,
            provinceName: neighborhood.provinceName,
            wardCode: neighborhood.wardCode,
            wardName: neighborhood.wardName,
        };
    }
    return {
        provinceCode: input.provinceCode,
        provinceName: input.provinceName,
        wardCode: input.wardCode,
        wardName: input.wardName,
    };
}

/**
 * Tra ve id cac nha so ma user dang thao tac thay chu nha (primary_owner/
 * co_owner/authorized_manager, truc tiep hoac qua to chuc dai dien) - dung boi
 * householdService/citizenService/businessService de loc theo cac nha ma
 * house_owner nay co quyen (khong the dung chung houseRecordScopeFilter o day
 * vi no thao tac tren Household/Citizen/Business, khong phai HouseRecord).
 */
export async function getOwnedHouseRecordIds(userId: unknown) {
    return getHouseIdsForActingOwner(userId);
}

/**
 * Kiem tra so dien thoai (chu nha ca nhan hoac nguoi dai dien to chuc) da co
 * tai khoan User dang nhap duoc trong he thong hay chua - dung de canh bao
 * ngay tren form tao nha so (xem HouseForm.tsx) TRUOC khi nop, vi
 * resolveOrCreateHouseOwner/resolveOrCreatePersonOwner se tu dong dung tai
 * khoan co san (khong tao trung) neu so dien thoai da ton tai. Chi kiem tra
 * User (tai khoan thuc su "quan ly duoc" nha, xem resolveActingUserId) - KHONG
 * kiem tra Person (danh tinh khai bao, khong dang nhap duoc nen khong "quan
 * ly" gi ca). Gate rieng o route bang permission "houses.create" (khong dung
 * "users.read", vi neighborhood_leader chi duoc users.read gioi han theo pham
 * vi cua minh - se bo sot tai khoan ngoai pham vi va bao sai "chua ton tai").
 */
export async function checkOwnerPhoneExists(
    phone: string,
): Promise<{ exists: boolean; displayName?: string }> {
    const user = await User.findOne({ phone }).select("displayName");
    if (!user) return { exists: false };
    return { exists: true, displayName: user.displayName };
}

/**
 * Tim User theo so dien thoai chu nha duoc nhan vien nhap luc tao nha so - neu
 * da ton tai thi gan them role house_owner (neu chua co) va dung tai khoan do
 * lam chu nha; neu chua ton tai thi tao moi. Neu ownerInput.password co, dat
 * luon mat khau (TAM THOI dang dung phone+password thay OTP - xem
 * LoginPage.tsx); neu khong, tai khoan tao ra chua co mat khau, tu dat/dang
 * nhap sau. Day la nhanh duy nhat ma ownerId co the KHAC actorUser._id ma
 * khong phai organization (staff tao ho thay cho nguoi dan chua co tai khoan).
 */
async function resolveOrCreateHouseOwner(
    actorUser: IUser,
    ownerInput: CreateHouseRecordOwnerInput,
): Promise<Types.ObjectId> {
    const existing = await User.findOne({ phone: ownerInput.phone });
    if (existing) {
        if (!existing.roles.includes("house_owner")) {
            existing.roles.push("house_owner");
            await existing.save();
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "user.grant_house_owner_role",
                targetModel: "User",
                targetId: existing._id,
            });
        }
        return existing._id as Types.ObjectId;
    }

    const passwordHash = ownerInput.password
        ? await hashPassword(ownerInput.password)
        : undefined;

    let user: IUser;
    try {
        user = await User.create({
            phone: ownerInput.phone,
            displayName: ownerInput.displayName,
            email: ownerInput.email || undefined,
            passwordHash,
            // Mat khau nay do NHAN VIEN/ADMIN dat thay (khong phai chinh chu
            // nha tu chon) - bat buoc doi mat khau ngay lan dang nhap dau
            // tien (xem User.mustChangePassword). Chi bat khi THUC SU co dat
            // mat khau (passwordHash) - tai khoan chua co mat khau (import
            // khong dien "Mật khẩu mặc định") van chua dang nhap duoc nen
            // khong can flag nay.
            mustChangePassword: !!passwordHash,
            roles: ["house_owner"],
            primaryRole: "house_owner",
            status: "active",
            createdBy: actorUser._id,
        });
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("Số điện thoại đã được sử dụng", 409);
        }
        throw err;
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "user.create_house_owner",
        targetModel: "User",
        targetId: user._id,
    });

    return user._id as Types.ObjectId;
}

/**
 * Nhu resolveOrCreateHouseOwner nhung KHONG tao tai khoan dang nhap duoc -
 * dung khi nhan vien khai bao chu nha ma khong tick "Tao tai khoan chu so
 * huu". Neu so dien thoai da co mot tai khoan User (vd chu nha nay da duoc
 * khai bao co tai khoan tu truoc, hoac tu dang ky), dung luon tai khoan do
 * (ownerType="user") thay vi tao Person trung lap; nguoc lai tim-hoac-tao
 * Person theo so dien thoai (ownerType="person").
 */
async function resolveOrCreatePersonOwner(
    actorUser: IUser,
    personInput: CreateHouseRecordOwnerInput,
): Promise<{ ownerType: OwnerType; ownerId: Types.ObjectId }> {
    const existingUser = await User.findOne({ phone: personInput.phone });
    if (existingUser) {
        return { ownerType: "user", ownerId: existingUser._id as Types.ObjectId };
    }

    const existingPerson = await Person.findOne({ phone: personInput.phone });
    if (existingPerson) {
        return { ownerType: "person", ownerId: existingPerson._id as Types.ObjectId };
    }

    const person = await Person.create({
        fullName: personInput.displayName,
        phone: personInput.phone,
        email: personInput.email || undefined,
        createdBy: actorUser._id,
    });
    return { ownerType: "person", ownerId: person._id as Types.ObjectId };
}

/**
 * Tim to chuc theo taxCode duoc nhan vien nhap inline luc tao nha so - tai su
 * dung neu da ton tai (khong con doi hoi actor phai la nguoi dai dien, khac
 * assertOrganizationOwnable cu, vi luong nay khong con picker chon to chuc co
 * san nua), tao moi (chua co nguoi dai dien) neu chua ton tai. Neu tao moi va
 * co createRepresentativeAccount + representative, gan luon nguoi dai dien
 * (tai khoan User) cho to chuc do - bo qua neu tai su dung to chuc da co san
 * de khong ghi de nguoi dai dien hien tai cua ho.
 */
async function resolveOrCreateOrganizationOwner(
    actorUser: IUser,
    input: CreateHouseRecordInput,
): Promise<Types.ObjectId> {
    const orgInput = input.organization!;
    // Chi tim-hoac-tai-su-dung khi co taxCode (khoa duy nhat de doi chieu) -
    // to chuc khong co taxCode luon duoc tao moi, khong co cach nao doi chieu
    // trung lap an toan.
    if (orgInput.taxCode) {
        const existing = await Organization.findOne({
            taxCode: orgInput.taxCode,
        });
        if (existing) {
            return existing._id as Types.ObjectId;
        }
    }

    const organization = await Organization.create({
        name: orgInput.name,
        taxCode: orgInput.taxCode,
        organizationType: orgInput.organizationType,
        address: orgInput.address,
        phone: orgInput.phone,
        email: orgInput.email || undefined,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "organization.create",
        targetModel: "Organization",
        targetId: organization._id,
        metadata: { name: organization.name, taxCode: organization.taxCode },
    });

    if (input.createRepresentativeAccount && input.representative) {
        const representativeUserId = await resolveOrCreateHouseOwner(
            actorUser,
            input.representative,
        );
        // Tao ban ghi OrganizationRepresentative (role="legal_representative")
        // thay vi ghi truc tiep len Organization - tu dong bo lai cache
        // representativeUserId/representativeRole - xem
        // organizationRepresentativeService.ts.
        await addOrganizationRepresentative(actorUser, String(organization._id), {
            userId: String(representativeUserId),
            role: "legal_representative",
        });
    }

    return organization._id as Types.ObjectId;
}

export async function createHouseRecord(
    actorUser: IUser,
    // "code": KHONG thuoc createHouseRecordSchema/HouseForm (luon tu sinh qua
    // generateSequentialCode cho luong tao nha so thong thuong) - chi duoc
    // truyen thu cong tu importService khi commit "Nhap Excel nha so", vi mot
    // so dia ban dung ma nha rieng (vd "H01-L19") khong theo dinh dang tuan tu
    // NSxxx. Khong them vao zod schema de nguoi dung thuong (qua API/HouseForm)
    // khong the tu dat ma tuy y.
    input: CreateHouseRecordInput & { code?: string },
): Promise<IHouseRecord> {
    const { cluster, streetId } = await resolveStreetClusterPair(input);
    assertClusterAssignable(actorUser, cluster);
    const neighborhood = await resolveNeighborhoodForHouse(input.neighborhoodId);
    const administrativeDivisions = resolveAdministrativeDivisions(
        neighborhood,
        input,
    );

    // Chu nha cua nha so moi, theo ownerKind duoc khai bao (xem
    // validators/houseRecord.ts):
    // - "individual": owner (ten/sdt/email) luon duoc thu thap; createOwnerAccount
    //   quyet dinh tao tai khoan User (resolveOrCreateHouseOwner) hay chi luu
    //   Person khai bao (resolveOrCreatePersonOwner).
    // - "organization": to chuc duoc khai bao inline, tim-hoac-tao theo taxCode
    //   (resolveOrCreateOrganizationOwner), kem nguoi dai dien neu co tick.
    // - "none": nhu truoc - actor la house_owner thi tu la chu nha (tu dang
    //   ky), con lai thi chua co chu nha (ownerId de trong, gan sau qua
    //   addHouseOwnership). Hien tai KHONG the doi loai chu nha sau khi tao
    //   (updateHouseRecord chi copy nguyen patch vao doc, khong resolve lai).
    let ownerType: OwnerType = "user";
    let ownerId: Types.ObjectId | string | undefined;
    if (input.ownerKind === "individual" && input.owner) {
        if (input.createOwnerAccount) {
            ownerId = await resolveOrCreateHouseOwner(actorUser, input.owner);
        } else {
            const resolved = await resolveOrCreatePersonOwner(actorUser, input.owner);
            ownerType = resolved.ownerType;
            ownerId = resolved.ownerId;
        }
    } else if (input.ownerKind === "organization" && input.organization) {
        ownerType = "organization";
        ownerId = await resolveOrCreateOrganizationOwner(actorUser, input);
    } else if (actorUser.roles.includes("house_owner")) {
        ownerId = actorUser._id;
    }

    const code =
        input.code || (await generateSequentialCode(HouseRecord, "NS", 3));
    const gis = normalizeHouseGis(input);
    let houseRecord: IHouseRecord;
    try {
        houseRecord = await HouseRecord.create({
            code,
            cluster,
            streetId,
            neighborhoodId: input.neighborhoodId || undefined,
            address: input.address,
            ...administrativeDivisions,
            physicalStatus: input.physicalStatus,
            usageTypes: input.usageTypes?.length
                ? input.usageTypes
                : ["household"],
            otherUsageNote: input.otherUsageNote,
            note: input.note,
            residenceDeclarationNumber: input.residenceDeclarationNumber,
            ...gis,
            createdBy: actorUser._id,
            updatedBy: actorUser._id,
        });
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError(`Mã nhà "${code}" đã tồn tại`, 409);
        }
        throw err;
    }

    // Tao quan he primary_owner ban dau trong HouseOwnership (nguon "su that"
    // cho quan he nhieu-nhieu House<->chu nha) - ham nay tu dong dong bo lai
    // HouseRecord.ownerId/ownerType nhu mot cache de cac noi doc nhanh
    // (populate, businessService...) khong phai join. Bo qua neu chua xac dinh
    // duoc chu nha (nhanh 4 o tren) - nha so tam thoi "chua co chu".
    if (ownerId) {
        await createInitialOwnership(actorUser, houseRecord._id, ownerType, ownerId);
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.create",
        targetModel: "HouseRecord",
        targetId: houseRecord._id,
        metadata: {
            code: houseRecord.code,
            gisSource: houseRecord.gisSource,
            geoConsentAccepted: input.geoConsentAccepted ?? null,
        },
    });

    // Doc lai tu DB (thay vi populate truc tiep tren doc trong bo nho) vi
    // createInitialOwnership ghi ownerId/ownerType cache qua updateOne rieng,
    // khong phan anh vao instance houseRecord dang giu o day.
    const created = await HouseRecord.findById(houseRecord._id).populate(
        HOUSE_RECORD_POPULATE,
    );
    return withInferredUsageTypes(created as IHouseRecord);
}

export async function listHouseRecords(params: {
    page: number;
    limit: number;
    search?: string;
    cluster?: string;
    streetId?: string;
    neighborhoodId?: string;
    wardCode?: number;
    status?: HouseRecordStatus | HouseRecordStatus[];
    actorUser: IUser;
}) {
    const isAdminUser = params.actorUser.roles.includes("admin");
    const isHouseOwnerUser = params.actorUser.roles.includes("house_owner");
    const filter: Record<string, unknown> = {};

    if (params.status) {
        filter.status = Array.isArray(params.status)
            ? { $in: params.status }
            : params.status;
    }

    const isNeighborhoodLeader =
        params.actorUser.roles.includes("neighborhood_leader") ||
        params.actorUser.roles.includes("neighborhood_coleader");
    // House_owner luon bi gioi han theo ownerId, khong duoc dung query
    // `cluster`/`streetId` de "mo rong" pham vi xem (ho khong co
    // assignedClusters de doi chieu). To truong (neighborhood_leader) cung
    // khong duoc di qua nhanh cluster/streetId ben duoi, vi nhanh do doi chieu
    // theo assignedClusters (thuong rong voi to truong) - se vo tinh bo qua
    // scope theo Neighborhood.
    //
    // Chi co MOT man hinh danh sach Nha so duy nhat dung chung cho ca chu nha
    // (xem "nha cua toi") lan can bo (xem "nha trong pham vi phu trach") - khong
    // co man hinh/endpoint rieng cho tung doi tuong. Mot nguoi co the VUA la
    // chu nha (o mot to khac, khong lien quan) VUA la To truong/To pho, nen khi
    // ho xem danh sach nay, pham vi phai la HOP (OR) ca hai: nha ho so huu VA
    // nha trong to dan pho ho phu trach - khong the bo mot phia, vi khong co
    // man hinh nao khac de xem phia con lai.
    if (isNeighborhoodLeader) {
        const neighborhoodFilter = areaScopeFilter(params.actorUser);
        if (isHouseOwnerUser) {
            const ownedHouseIds = await getHouseIdsForActingOwner(
                params.actorUser._id,
            );
            filter.$or = [neighborhoodFilter, { _id: { $in: ownedHouseIds } }];
        } else {
            Object.assign(filter, neighborhoodFilter);
        }
        if (params.streetId) filter.streetId = params.streetId;
        else if (params.cluster) filter.cluster = params.cluster;
    } else if ((params.cluster || params.streetId) && !isHouseOwnerUser) {
        const allowedClusters = params.actorUser.assignedClusters;
        // Kiem tra quyen theo cluster (assignedClusters van dua tren ten
        // cluster, chua co assignedStreetIds rieng) - neu loc theo streetId
        // thi resolve nguoc ve ten cluster tuong ung de doi chieu.
        const targetCluster = params.streetId
            ? (await resolveClusterForStreet(params.streetId)).cluster
            : (params.cluster as string);
        if (
            !isAdminUser &&
            allowedClusters?.length &&
            !allowedClusters.includes(targetCluster)
        ) {
            throw new HttpError("Bạn không có quyền xem cụm dân cư này", 403);
        }
        if (params.streetId) {
            filter.streetId = params.streetId;
        } else {
            filter.cluster = params.cluster;
        }
    } else {
        Object.assign(filter, await houseRecordScopeFilter(params.actorUser));
    }

    // To dan pho la thuoc tinh rieng cua tung nha so (khong lien quan
    // assignedClusters), nen loc them (AND) chu khong thay the scope o tren.
    if (params.neighborhoodId) {
        filter.neighborhoodId = params.neighborhoodId;
    }

    // Phuong/xa - loc doc lap (AND), khong gan voi RBAC/pham vi nao (khac
    // cluster/neighborhoodId ben tren) - chi phuc vu tim kiem/loc danh sach
    // khi ung dung quan ly nhieu phuong/xa cung luc.
    if (params.wardCode) {
        filter.wardCode = params.wardCode;
    }

    if (params.search) {
        filter.$or = [
            { code: { $regex: params.search, $options: "i" } },
            { address: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        HouseRecord.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate(HOUSE_RECORD_POPULATE),
        HouseRecord.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

/**
 * Tim kiem nha so RUT GON (chi ma/dia chi), KHONG loc theo pham vi so huu/phu
 * trach (khac listHouseRecords) - dung rieng cho luong chon "nha so lien
 * quan" khi gui phan anh: nguoi gui co the bao ve mot nha KHONG PHAI cua ho
 * (vd nha hang xom), nen khong the gioi han theo ownerId/assignedClusters
 * nhu man quan ly nha so thong thuong. Chi tra ve du lieu dia chi cong khai
 * (khong ten chu ho, so dien thoai, trang thai xac minh...), tranh lo thong
 * tin nhay cam qua tinh nang tim kiem mo nay.
 */
export async function searchHousesForComplaintTarget(
    search?: string,
    limit = 20,
): Promise<Array<{ _id: unknown; code: string; address?: string; cluster?: string }>> {
    const filter: Record<string, unknown> = search
        ? {
              $or: [
                  { code: { $regex: search, $options: "i" } },
                  { address: { $regex: search, $options: "i" } },
              ],
          }
        : {};
    return HouseRecord.find(filter)
        .select("code address cluster")
        .sort({ code: 1 })
        .limit(limit);
}

export async function getHouseRecordById(id: string): Promise<IHouseRecord> {
    const houseRecord =
        await HouseRecord.findById(id).populate(HOUSE_RECORD_POPULATE);
    if (!houseRecord) throw new HttpError("Không tìm thấy nhà số", 404);
    return withInferredUsageTypes(houseRecord);
}

export async function updateHouseRecord(
    actorUser: IUser,
    id: string,
    patch: UpdateHouseRecordInput,
    // bypassVerifiedGate=true: dung DUY NHAT boi changeRequestService khi ap
    // dung mot ChangeRequest da duoc duyet (chinh no la ly do hop le de sua
    // truong da bi khoa boi trang thai "verified") - van chay lai toan bo logic
    // resolve cluster/streetId/neighborhoodId->province/ward ben duoi thay vi
    // update tho, tranh sai lech du lieu dia gioi.
    opts: { bypassVerifiedGate?: boolean } = {},
): Promise<IHouseRecord> {
    const houseRecord = await HouseRecord.findById(id);
    if (!houseRecord) throw new HttpError("Không tìm thấy nhà số", 404);

    if (houseRecord.status === "locked" && !actorUser.roles.includes("admin")) {
        throw new HttpError(
            "Nhà số đã bị khóa, chỉ quản trị viên mới có thể chỉnh sửa",
            403,
        );
    }

    const editsProtectedField = Object.keys(patch).some(key =>
        HOUSE_RECORD_PROTECTED_FIELDS.includes(key),
    );
    // Chuyen to dan pho (neighborhoodId) KHONG duoc nam trong dien mien tru cua
    // admin nhu cac truong bao ve khac - moi nguoi, ke ca admin, deu phai di qua
    // ChangeRequest (transfer_neighborhood) de co lich su/duyet dung quy trinh.
    // Chi loi thoat hop le la bypassVerifiedGate tu changeRequestService sau khi
    // ChangeRequest da duoc duyet.
    const editsNeighborhood = patch.neighborhoodId !== undefined;
    if (
        houseRecord.status === "verified" &&
        editsProtectedField &&
        !opts.bypassVerifiedGate &&
        (editsNeighborhood || !actorUser.roles.includes("admin"))
    ) {
        throw new HttpError(
            editsNeighborhood
                ? "Nhà số đã được xác minh, việc chuyển tổ dân phố phải thực hiện qua yêu cầu thay đổi thông tin"
                : "Nhà số đã được xác minh, vui lòng gửi yêu cầu thay đổi thông tin thay vì sửa trực tiếp",
            403,
        );
    }

    if (patch.cluster !== undefined || patch.streetId !== undefined) {
        const resolved = await resolveStreetClusterPair(patch);
        assertClusterAssignable(actorUser, resolved.cluster);
        patch = { ...patch, cluster: resolved.cluster, streetId: resolved.streetId };
    }
    if (patch.neighborhoodId) {
        const neighborhood = await resolveNeighborhoodForHouse(
            patch.neighborhoodId,
        );
        patch = {
            ...patch,
            ...resolveAdministrativeDivisions(neighborhood, patch),
        };
    }

    const updatesGis =
        patch.gisLatitude !== undefined ||
        patch.gisLongitude !== undefined ||
        patch.gisAccuracyMeters !== undefined ||
        patch.gisSource !== undefined ||
        patch.gisCapturedAt !== undefined;
    const normalizedGis = updatesGis
        ? normalizeHouseGis({
              gisLatitude:
                  patch.gisLatitude !== undefined
                      ? patch.gisLatitude
                      : houseRecord.gisLatitude,
              gisLongitude:
                  patch.gisLongitude !== undefined
                      ? patch.gisLongitude
                      : houseRecord.gisLongitude,
              gisAccuracyMeters:
                  patch.gisAccuracyMeters !== undefined
                      ? patch.gisAccuracyMeters
                      : houseRecord.gisAccuracyMeters,
              gisSource: patch.gisSource ?? houseRecord.gisSource,
              gisCapturedAt:
                  patch.gisCapturedAt !== undefined
                      ? patch.gisCapturedAt
                      : houseRecord.gisCapturedAt?.toISOString(),
          })
        : undefined;

    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (houseRecord as unknown as Record<string, unknown>)[key] = value;
        }
    }
    if (normalizedGis) {
        houseRecord.gisLatitude = normalizedGis.gisLatitude;
        houseRecord.gisLongitude = normalizedGis.gisLongitude;
        houseRecord.gisAccuracyMeters = normalizedGis.gisAccuracyMeters;
        houseRecord.gisSource = normalizedGis.gisSource;
        houseRecord.gisCapturedAt = normalizedGis.gisCapturedAt;
        if (normalizedGis.location) {
            houseRecord.location = normalizedGis.location;
        } else {
            houseRecord.set("location", undefined);
        }
    }
    houseRecord.updatedBy = actorUser._id as any;
    await houseRecord.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: editsNeighborhood ? "house.transfer_neighborhood" : "house.update",
        targetModel: "HouseRecord",
        targetId: houseRecord._id,
        metadata: patch,
    });

    await houseRecord.populate(HOUSE_RECORD_POPULATE);

    return withInferredUsageTypes(houseRecord);
}

/** Cap nhat GIS rieng de can bo di dong khong can quyen sua toan bo ho so. */
export async function updateHouseRecordGis(
    actorUser: IUser,
    id: string,
    input: HouseGisInput,
): Promise<IHouseRecord> {
    const houseRecord = await HouseRecord.findById(id);
    if (!houseRecord) throw new HttpError("Không tìm thấy nhà số", 404);
    await assertHouseRecordInScope(actorUser, houseRecord);

    const gis = normalizeHouseGis(input);
    houseRecord.gisLatitude = gis.gisLatitude;
    houseRecord.gisLongitude = gis.gisLongitude;
    houseRecord.gisAccuracyMeters = gis.gisAccuracyMeters;
    houseRecord.gisSource = gis.gisSource;
    houseRecord.gisCapturedAt = gis.gisCapturedAt;
    if (gis.location) houseRecord.location = gis.location;
    else houseRecord.set("location", undefined);
    houseRecord.updatedBy = actorUser._id as any;
    await houseRecord.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.gis_update",
        targetModel: "HouseRecord",
        targetId: houseRecord._id,
        metadata: {
            gisSource: houseRecord.gisSource,
            hasCoordinates: Boolean(houseRecord.location),
            accuracyMeters: houseRecord.gisAccuracyMeters,
        },
    });

    await houseRecord.populate(HOUSE_RECORD_POPULATE);
    return withInferredUsageTypes(houseRecord);
}

/**
 * Chuyen trang thai xac thuc cua nha so, ap dung dung mot trong ba luat sau:
 * - admin: duoc chuyen sang bat ky trang thai nao, bat ke trang thai hien tai
 *   (kem ca khoa/mo khoa), giong quyen han khong gioi han cua admin o noi khac
 *   trong he thong.
 * - chu nha (dang thao tac thay chu nha - xem isHouseOwnerActor): chi duoc
 *   gui/gui lai de duyet, tuc la tu "unverified", "denied" hoac "needs_update"
 *   chuyen sang "pending".
 * - nhan vien khac (to truong, bi thu, can bo UBND - da duoc kiem tra co
 *   quyen "houses.verify" o tang route): chi duoc duyet/tu choi/yeu cau cap
 *   nhat khi nha dang "pending", va phai nam trong pham vi cum duoc phan cong
 *   (assertHouseRecordInScope). "needs_update" khac "denied": chu nha VAN
 *   duoc sua House/Household/Business/Company va gui lai duyet (xem
 *   assertHouseRecordAllowsDeclaration/updateHouseRecord - khong chan trang
 *   thai nay), chi la mot loi nhac "con thieu gi do" thay vi tu choi han.
 * Nha da bi khoa thi khong ai ngoai admin duoc doi trang thai.
 */
export async function transitionHouseRecordStatus(
    actorUser: IUser,
    id: string,
    targetStatus: HouseRecordStatus,
    note?: string,
): Promise<IHouseRecord> {
    const houseRecord = await HouseRecord.findById(id);
    if (!houseRecord) throw new HttpError("Không tìm thấy nhà số", 404);

    const isAdmin = actorUser.roles.includes("admin");
    const isOwner = await isHouseOwnerActor(houseRecord._id, actorUser._id);

    if (!isAdmin) {
        if (houseRecord.status === "locked") {
            throw new HttpError(
                "Nhà số đã bị khóa, chỉ quản trị viên mới có thể thay đổi trạng thái",
                403,
            );
        }

        if (isOwner) {
            const canSubmit =
                targetStatus === "pending" &&
                ["unverified", "denied", "needs_update"].includes(
                    houseRecord.status,
                );
            if (!canSubmit) {
                throw new HttpError(
                    "Chủ nhà chỉ được gửi duyệt từ trạng thái chưa xác thực, bị từ chối hoặc cần cập nhật",
                    403,
                );
            }
        } else {
            // Kiem tra rieng quyen "houses.verify" o day (khong chi dua vao
            // assertHouseRecordInScope, vi assertHouseRecordInScope chi kiem tra
            // pham vi cum - regional_police cung co assignedClusters rong nhu
            // secretary/PCO nen se "lot" qua kiem tra cum neu khong chan them
            // o day, du ho khong duoc cap quyen duyet).
            if (!(await userHasPermission(actorUser, "houses.verify"))) {
                throw new HttpError(
                    "Bạn không có quyền duyệt/từ chối nhà số",
                    403,
                );
            }
            await assertHouseRecordInScope(actorUser, houseRecord);
            const canVerify =
                houseRecord.status === "pending" &&
                ["verified", "denied", "needs_update"].includes(targetStatus);
            if (!canVerify) {
                throw new HttpError(
                    "Chỉ được duyệt, từ chối hoặc yêu cầu cập nhật nhà số đang chờ duyệt",
                    403,
                );
            }
        }
    }

    const previousStatus = houseRecord.status;
    houseRecord.status = targetStatus;
    houseRecord.updatedBy = actorUser._id as any;
    if (targetStatus === "verified") houseRecord.approvalNote = note;
    if (targetStatus === "denied") houseRecord.denialReason = note;
    if (targetStatus === "needs_update") houseRecord.needsUpdateNote = note;
    await houseRecord.save();

    // Ket qua duyet/tu choi nha so cung la ket qua duyet cho quan he
    // primary_owner dang active (chua co khai niem xac thuc rieng cho tung
    // quan he - xem HouseOwnership.verificationStatus) - dong bo lai de hai
    // ben khop nhau.
    if (targetStatus === "verified" || targetStatus === "denied") {
        await syncPrimaryOwnershipVerification(
            houseRecord._id,
            targetStatus === "verified" ? "verified" : "rejected",
        );
    }

    // Nha so vua duoc xac thuc - moi Household/Business "unverified" duoi nha
    // nay duoc chuyen thanh "pending" (cho xac thuc rieng, KHONG tu dong thanh
    // "verified" - xac thuc cua Household/Business la doc lap voi nha so).
    // KHONG dong lai "pending"/"verified"/"denied" da co san, va KHONG lam
    // nguoc lai khi nha bi tu choi sau nay ("denied") - dung theo dac ta.
    if (targetStatus === "verified") {
        await Promise.all([
            Household.updateMany(
                { houseId: houseRecord._id, status: "unverified" },
                { status: "pending" },
            ),
            Business.updateMany(
                { houseId: houseRecord._id, status: "unverified" },
                { status: "pending" },
            ),
        ]);
    }

    // Bao cho tat ca nguoi dang thao tac thay chu nha (primary_owner/co_owner/
    // authorized_manager, hoac nguoi dai dien to chuc) biet ket qua duyet ho so
    // - chi khi co nguoi nhan, chi voi ket qua cuoi cung (verified/denied), va
    // chi khi trang thai thuc su thay doi (tranh spam thong bao neu admin gui
    // lai cung mot trang thai).
    const ownerActingUserIds = await resolveActiveHouseOwnerActingUserIds(
        houseRecord._id,
    );
    if (
        ownerActingUserIds.length &&
        previousStatus !== targetStatus &&
        (targetStatus === "verified" || targetStatus === "denied")
    ) {
        await createNotification({
            title: "Kết quả xác thực nhà số",
            body: `Nhà số ${houseRecord.code} của bạn ${
                HOUSE_RECORD_STATUS_LABEL[targetStatus]
            }${note ? `: ${note}` : ""}`,
            type: "house_record.status_changed",
            targetUserIds: ownerActingUserIds,
            relatedModel: "HouseRecord",
            relatedId: houseRecord._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.status_change",
        targetModel: "HouseRecord",
        targetId: houseRecord._id,
        metadata: { previousStatus, status: targetStatus, note },
    });

    await houseRecord.populate(HOUSE_RECORD_POPULATE);
    return withInferredUsageTypes(houseRecord);
}

export interface BulkHouseActionResult {
    succeededIds: string[];
    failed: { id: string; message: string }[];
}

/**
 * Gan mot to dan pho cho NHIEU nha so cung luc (vd nha nhap tu Excel con
 * thieu to dan pho) - danh cho man "Danh sach nha so" chon nhieu dong roi
 * thao tac hang loat. Goi lai updateHouseRecord() TUNG nha mot (khong tu
 * viet lai logic) de tan dung nguyen ven cac rang buoc da co: nha "verified"
 * se bi tu choi (403, phai di qua ChangeRequest chuyen to dan pho), nha
 * ngoai pham vi cua actor se bi tu choi... Loi cua tung nha KHONG lam dung
 * ca lo - duoc gom lai va tra ve trong "failed" de UI hien thi ro nha nao
 * thanh cong/that bai va vi sao.
 */
export async function bulkAssignHouseNeighborhood(
    actorUser: IUser,
    ids: string[],
    neighborhoodId: string,
): Promise<BulkHouseActionResult> {
    const succeededIds: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await updateHouseRecord(actorUser, id, { neighborhoodId });
            succeededIds.push(id);
        } catch (err) {
            failed.push({
                id,
                message:
                    err instanceof HttpError ? err.message : "Có lỗi xảy ra",
            });
        }
    }
    return { succeededIds, failed };
}

/**
 * Chuyen trang thai xac thuc cho NHIEU nha so cung luc (vd duyet hang loat
 * cac nha dang "Chờ duyệt") - goi lai transitionHouseRecordStatus() TUNG nha
 * mot, cung ly do voi bulkAssignHouseNeighborhood o tren (tai su dung nguyen
 * rang buoc chuyen trang thai hop le, gom loi rieng tung nha thay vi chan ca
 * lo). Nha khong o dung trang thai nguon (vd da "verified" tu truoc) se rot
 * vao "failed" voi thong bao loi co san, khong lam dung nhung nha con lai.
 */
export async function bulkTransitionHouseRecordStatus(
    actorUser: IUser,
    ids: string[],
    targetStatus: HouseRecordStatus,
    note?: string,
): Promise<BulkHouseActionResult> {
    const succeededIds: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await transitionHouseRecordStatus(actorUser, id, targetStatus, note);
            succeededIds.push(id);
        } catch (err) {
            failed.push({
                id,
                message:
                    err instanceof HttpError ? err.message : "Có lỗi xảy ra",
            });
        }
    }
    return { succeededIds, failed };
}

export async function deleteHouseRecord(
    actorId: string,
    id: string,
): Promise<IHouseRecord> {
    const houseRecord = await HouseRecord.findById(id);
    if (!houseRecord) throw new HttpError("Không tìm thấy nhà số", 404);

    const linkedHouseholdCount = await Household.countDocuments({
        houseId: id,
    });
    if (linkedHouseholdCount > 0) {
        throw new HttpError(
            "Không thể xóa nhà số vì vẫn còn hộ dân liên kết, vui lòng chuyển hoặc gỡ liên kết hộ dân trước",
            409,
        );
    }

    const linkedBusinessCount = await Business.countDocuments({
        houseId: id,
    });
    if (linkedBusinessCount > 0) {
        throw new HttpError(
            "Không thể xóa nhà số vì vẫn còn hộ kinh doanh liên kết, vui lòng xóa hộ kinh doanh trước",
            409,
        );
    }

    await houseRecord.deleteOne();
    await deleteAllOwnershipsForHouse(id);

    await writeAuditLog({
        actorId,
        action: "house.delete",
        targetModel: "HouseRecord",
        targetId: id,
        metadata: { code: houseRecord.code },
    });

    return houseRecord;
}
