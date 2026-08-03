import type { Types } from "mongoose";
import {
    HouseRecord,
    Household,
    Business,
    Organization,
    Neighborhood,
    type IHouseRecord,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateSequentialCode } from "@/lib/utils";
import { clusterScopeFilter, areaScopeFilter, userHasPermission } from "@/lib/rbac";
import { resolveClusterForStreet, resolveStreetClusterPair } from "@/lib/streetSync";
import { writeAuditLog } from "@/services/auditService";
import { createNotification } from "@/services/notificationService";
import { HOUSE_RECORD_STATUS_LABEL, type HouseRecordStatus } from "@/types";
import type {
    CreateHouseRecordInput,
    UpdateHouseRecordInput,
} from "@/validators/houseRecord";

const HOUSE_RECORD_POPULATE = [
    { path: "streetId", select: "name code" },
    { path: "neighborhoodId", select: "name code" },
];

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
 * Tra ve id cua User thuc su "dung sau" chu so huu cua nha so - dung de so
 * sanh voi actor hien tai va de gui thong bao:
 * - ownerType="user": chinh ownerId.
 * - ownerType="organization": representativeUserId cua Organization do (to
 *   chuc khong tu dang nhap duoc - xem authService.ts, chi User moi co
 *   session), tra ve undefined neu khong tim thay to chuc.
 */
export async function resolveOwnerActingUserId(
    houseRecord: IHouseRecord,
): Promise<Types.ObjectId | undefined> {
    if (!houseRecord.ownerId) return undefined;
    if (houseRecord.ownerType === "organization") {
        const organization = await Organization.findById(
            houseRecord.ownerId,
        ).select("representativeUserId");
        return organization?.representativeUserId;
    }
    return houseRecord.ownerId as Types.ObjectId;
}

/**
 * Nem HttpError(403) neu user khong duoc phep thao tac voi nha so nay:
 * - admin: luon duoc phep.
 * - chu nha (ownerId trung voi user hien tai, hoac user la nguoi dai dien cua
 *   to chuc chu nha - xem resolveOwnerActingUserId): luon duoc phep voi nha
 *   cua minh.
 * - house_owner khac (khong phai chu nha nay): khong bao gio duoc phep.
 * - nhan vien (to truong, bi thu, cong an, can bo UBND): theo assignedClusters
 *   nhu truoc (rong neu khong duoc gan cum cu the).
 */
export async function assertHouseRecordInScope(
    user: IUser,
    houseRecord: IHouseRecord,
): Promise<void> {
    if (user.roles.includes("admin")) return;
    const ownerActingUserId = await resolveOwnerActingUserId(houseRecord);
    if (ownerActingUserId && String(ownerActingUserId) === String(user._id)) {
        return;
    }
    if (user.roles.includes("house_owner")) {
        throw new HttpError(
            "Bạn không có quyền thao tác với nhà số của người khác",
            403,
        );
    }
    if (user.roles.includes("neighborhood_leader")) {
        const ids = [user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])]
            .filter(Boolean)
            .map(String);
        if (
            !houseRecord.neighborhoodId ||
            !ids.includes(String(houseRecord.neighborhoodId))
        ) {
            throw new HttpError(
                "Ban khong co quyen thao tac voi nha so ngoai to dan pho duoc phan cong",
                403,
            );
        }
        return;
    }
    if (
        user.assignedClusters?.length &&
        !user.assignedClusters.includes(houseRecord.cluster)
    ) {
        throw new HttpError(
            "Ban khong co quyen thao tac voi nha so ngoai cum duoc phan cong",
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
 * Dieu kien loc danh sach nha so theo pham vi cua actor:
 * - admin: xem tat ca.
 * - house_owner: chi xem nha so ma minh la chu - hoac truc tiep (ownerType
 *   "user", ownerId=user._id) hoac gian tiep qua to chuc ma minh la nguoi dai
 *   dien (ownerType "organization") - KHONG duoc roi vao nhanh
 *   clusterScopeFilter vi house_owner luon co assignedClusters rong -> se bi
 *   hieu nham la "khong gioi han" (xem duoc toan bo phuong) neu dung chung
 *   logic voi nhan vien.
 * - nhan vien: nhu truoc, theo assignedClusters (rong = xem toan phuong).
 */
async function houseRecordScopeFilter(
    user: IUser,
): Promise<Record<string, unknown>> {
    if (user.roles.includes("admin")) return {};
    if (user.roles.includes("house_owner")) {
        return ownedHouseRecordFilter(user._id);
    }
    return areaScopeFilter(user);
}

/**
 * Dieu kien Mongo tra ve cac nha so ma userId so huu - truc tiep (ownerType
 * "user") hoac qua to chuc ma userId la nguoi dai dien (ownerType
 * "organization"). Dung chung boi houseRecordScopeFilter va
 * getOwnedHouseRecordIds de tranh lech logic giua hai noi.
 */
async function ownedHouseRecordFilter(
    userId: unknown,
): Promise<Record<string, unknown>> {
    const organizations = await Organization.find({
        representativeUserId: userId,
    }).select("_id");
    return {
        $or: [
            { ownerType: "user", ownerId: userId },
            {
                ownerType: "organization",
                ownerId: { $in: organizations.map(o => o._id) },
            },
        ],
    };
}

/**
 * Nem HttpError(404) neu neighborhoodId duoc chon khong ton tai - to dan pho
 * gan truc tiep vao tung nha so (khong suy ra tu Street, vi mot duong/pho co
 * the chay qua nhieu to dan pho).
 */
async function assertNeighborhoodExists(
    neighborhoodId?: string | null,
): Promise<void> {
    if (!neighborhoodId) return;
    const exists = await Neighborhood.exists({ _id: neighborhoodId });
    if (!exists) {
        throw new HttpError("Khong tim thay to dan pho", 404);
    }
}

/**
 * Tra ve id cac nha so ma user la chu so huu - dung boi householdService/
 * citizenService de loc ho dan/nhan khau theo cac nha ma house_owner so huu
 * (khong the dung chung houseRecordScopeFilter o day vi no thao tac tren
 * Household/Citizen, khong phai HouseRecord).
 */
export async function getOwnedHouseRecordIds(userId: unknown) {
    const filter = await ownedHouseRecordFilter(userId);
    const houseRecords = await HouseRecord.find(filter).select("_id");
    return houseRecords.map(h => h._id);
}

/**
 * Nem HttpError neu organizationId duoc chon lam chu nha khong hop le: khong
 * ton tai, da bi vo hieu hoa, hoac actor khong phai nguoi dai dien cua to
 * chuc do - chi nguoi dai dien moi duoc dang ky nha dung ten to chuc minh
 * (giong pattern validateHeadOfHouseholdUser cua householdService.ts).
 */
async function assertOrganizationOwnable(
    actorUser: IUser,
    organizationId: string,
): Promise<void> {
    const organization = await Organization.findById(organizationId);
    if (!organization) throw new HttpError("Khong tim thay to chuc", 404);
    if (!organization.active) {
        throw new HttpError(
            "To chuc da bi vo hieu hoa, khong the dang ky nha so moi",
            422,
        );
    }
    if (String(organization.representativeUserId) !== String(actorUser._id)) {
        throw new HttpError(
            "Ban khong phai nguoi dai dien cua to chuc nay",
            403,
        );
    }
}

export async function createHouseRecord(
    actorUser: IUser,
    input: CreateHouseRecordInput,
): Promise<IHouseRecord> {
    const { cluster, streetId } = await resolveStreetClusterPair(input);
    assertClusterAssignable(actorUser, cluster);
    await assertNeighborhoodExists(input.neighborhoodId);

    if (input.organizationId) {
        await assertOrganizationOwnable(actorUser, input.organizationId);
    }

    const code = await generateSequentialCode(HouseRecord, "NS", 3);
    const houseRecord = await HouseRecord.create({
        code,
        cluster,
        streetId,
        neighborhoodId: input.neighborhoodId || undefined,
        address: input.address,
        // Nguoi (hoac to chuc, neu co chon organizationId) tao nha so duoc
        // coi la chu nha (ap dung cho ca house_owner tu dang ky lan nhan vien
        // tao ho khi nguoi dan chua co tai khoan).
        ownerType: input.organizationId ? "organization" : "user",
        ownerId: input.organizationId || actorUser._id,
        note: input.note,
        residenceDeclarationNumber: input.residenceDeclarationNumber,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.create",
        targetModel: "HouseRecord",
        targetId: houseRecord._id,
        metadata: { code: houseRecord.code },
    });

    await houseRecord.populate(HOUSE_RECORD_POPULATE);
    return houseRecord;
}

export async function listHouseRecords(params: {
    page: number;
    limit: number;
    search?: string;
    cluster?: string;
    streetId?: string;
    neighborhoodId?: string;
    status?: HouseRecordStatus;
    actorUser: IUser;
}) {
    const isAdminUser = params.actorUser.roles.includes("admin");
    const isHouseOwnerUser = params.actorUser.roles.includes("house_owner");
    const filter: Record<string, unknown> = {};

    if (params.status) {
        filter.status = params.status;
    }

    const isNeighborhoodLeader = params.actorUser.roles.includes(
        "neighborhood_leader",
    );
    // House_owner luon bi gioi han theo ownerId, khong duoc dung query
    // `cluster`/`streetId` de "mo rong" pham vi xem (ho khong co
    // assignedClusters de doi chieu). To truong (neighborhood_leader) cung
    // khong duoc di qua nhanh cluster/streetId ben duoi, vi nhanh do doi chieu
    // theo assignedClusters (thuong rong voi to truong) - se vo tinh bo qua
    // scope theo Neighborhood.
    if (isNeighborhoodLeader && !isHouseOwnerUser) {
        Object.assign(filter, areaScopeFilter(params.actorUser));
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
            throw new HttpError("Ban khong co quyen xem cum dan cu nay", 403);
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

export async function getHouseRecordById(id: string): Promise<IHouseRecord> {
    const houseRecord =
        await HouseRecord.findById(id).populate(HOUSE_RECORD_POPULATE);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
    return houseRecord;
}

export async function updateHouseRecord(
    actorUser: IUser,
    id: string,
    patch: UpdateHouseRecordInput,
): Promise<IHouseRecord> {
    const houseRecord = await HouseRecord.findById(id);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);

    if (houseRecord.status === "locked" && !actorUser.roles.includes("admin")) {
        throw new HttpError(
            "Nhà số đã bị khóa, chỉ quản trị viên mới có thể chỉnh sửa",
            403,
        );
    }

    if (patch.cluster !== undefined || patch.streetId !== undefined) {
        const resolved = await resolveStreetClusterPair(patch);
        assertClusterAssignable(actorUser, resolved.cluster);
        patch = { ...patch, cluster: resolved.cluster, streetId: resolved.streetId };
    }
    if (patch.neighborhoodId) {
        await assertNeighborhoodExists(patch.neighborhoodId);
    }

    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (houseRecord as unknown as Record<string, unknown>)[key] = value;
        }
    }
    houseRecord.updatedBy = actorUser._id as any;
    await houseRecord.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.update",
        targetModel: "HouseRecord",
        targetId: houseRecord._id,
        metadata: patch,
    });

    await houseRecord.populate(HOUSE_RECORD_POPULATE);

    return houseRecord;
}

/**
 * Chuyen trang thai xac thuc cua nha so, ap dung dung mot trong ba luat sau:
 * - admin: duoc chuyen sang bat ky trang thai nao, bat ke trang thai hien tai
 *   (kem ca khoa/mo khoa), giong quyen han khong gioi han cua admin o noi khac
 *   trong he thong.
 * - chu nha (ownerId trung actor): chi duoc gui/gui lai de duyet, tuc la tu
 *   "unverified" hoac "denied" chuyen sang "pending".
 * - nhan vien khac (to truong, bi thu, can bo UBND - da duoc kiem tra co
 *   quyen "houses.verify" o tang route): chi duoc duyet/tu choi khi nha dang
 *   "pending", va phai nam trong pham vi cum duoc phan cong (assertHouseRecordInScope).
 * Nha da bi khoa thi khong ai ngoai admin duoc doi trang thai.
 */
export async function transitionHouseRecordStatus(
    actorUser: IUser,
    id: string,
    targetStatus: HouseRecordStatus,
): Promise<IHouseRecord> {
    const houseRecord = await HouseRecord.findById(id);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);

    const isAdmin = actorUser.roles.includes("admin");
    const ownerActingUserId = await resolveOwnerActingUserId(houseRecord);
    const isOwner =
        !!ownerActingUserId && String(ownerActingUserId) === String(actorUser._id);

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
                ["unverified", "denied"].includes(houseRecord.status);
            if (!canSubmit) {
                throw new HttpError(
                    "Chủ nhà chỉ được gửi duyệt từ trạng thái chưa xác thực hoặc bị từ chối",
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
                ["verified", "denied"].includes(targetStatus);
            if (!canVerify) {
                throw new HttpError(
                    "Chỉ được duyệt hoặc từ chối nhà số đang chờ duyệt",
                    403,
                );
            }
        }
    }

    const previousStatus = houseRecord.status;
    houseRecord.status = targetStatus;
    houseRecord.updatedBy = actorUser._id as any;
    await houseRecord.save();

    // Bao cho chu nha (hoac nguoi dai dien to chuc chu nha) biet ket qua duyet
    // ho so - chi khi xac dinh duoc nguoi nhan, chi voi ket qua cuoi cung
    // (verified/denied), va chi khi trang thai thuc su thay doi (tranh spam
    // thong bao neu admin gui lai cung mot trang thai).
    if (
        ownerActingUserId &&
        previousStatus !== targetStatus &&
        (targetStatus === "verified" || targetStatus === "denied")
    ) {
        await createNotification({
            title: "Kết quả xác thực nhà số",
            body: `Nhà số ${houseRecord.code} của bạn ${
                HOUSE_RECORD_STATUS_LABEL[targetStatus]
            }`,
            type: "house_record.status_changed",
            targetUserIds: [ownerActingUserId],
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
        metadata: { status: targetStatus },
    });

    await houseRecord.populate(HOUSE_RECORD_POPULATE);
    return houseRecord;
}

export async function deleteHouseRecord(
    actorId: string,
    id: string,
): Promise<IHouseRecord> {
    const houseRecord = await HouseRecord.findById(id);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);

    const linkedHouseholdCount = await Household.countDocuments({
        houseId: id,
    });
    if (linkedHouseholdCount > 0) {
        throw new HttpError(
            "Khong the xoa nha so vi van con ho dan lien ket, vui long chuyen hoac go lien ket ho dan truoc",
            409,
        );
    }

    const linkedBusinessCount = await Business.countDocuments({
        houseId: id,
    });
    if (linkedBusinessCount > 0) {
        throw new HttpError(
            "Khong the xoa nha so vi van con ho kinh doanh lien ket, vui long xoa ho kinh doanh truoc",
            409,
        );
    }

    await houseRecord.deleteOne();

    await writeAuditLog({
        actorId,
        action: "house.delete",
        targetModel: "HouseRecord",
        targetId: id,
        metadata: { code: houseRecord.code },
    });

    return houseRecord;
}
