import {
    Household,
    Citizen,
    HouseRecord,
    User,
    type IHousehold,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateSequentialCode } from "@/lib/utils";
import { clusterScopeFilter, areaScopeFilter } from "@/lib/rbac";
import { resolveClusterForStreet, resolveStreetClusterPair } from "@/lib/streetSync";
import { writeAuditLog } from "@/services/auditService";
import {
    assertHouseRecordInScope,
    assertHouseRecordVerifiedForMembers,
    getOwnedHouseRecordIds,
    resolveOwnerActingUserId,
} from "@/services/houseRecordService";
import type {
    CreateHouseholdInput,
    UpdateHouseholdInput,
} from "@/validators/household";

/**
 * Nem HttpError(403) neu actor khong phai admin va cluster truyen vao khong
 * nam trong assignedClusters cua actor - dung khi tao/doi cluster cua ho dan,
 * de tranh tao ra ho dan "mo coi" ma chinh nguoi tao cung khong con thay duoc
 * (vi clusterScopeFilter se loc theo assignedClusters cho cac truy van sau do).
 * House_owner khong co assignedClusters va khong phai nhan vien nen duoc bo
 * qua kiem tra nay (ho tu khai bao cum dan cu cua minh khi tu dang ky ho dan) -
 * giong het bypass tuong tu trong houseRecordService.ts.
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
 * Nem HttpError neu userId duoc chon lam chu ho khong hop le: khong ton tai,
 * khong dang hoat dong, hoac khong co vai tro house_owner - dung khi lien ket
 * headOfHouseholdUserId (giong pattern kiem tra to truong trong
 * neighborhoodService.assignNeighborhoodLeader).
 */
async function validateHeadOfHouseholdUser(userId: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) throw new HttpError("Khong tim thay nguoi dung", 404);
    if (user.status !== "active") {
        throw new HttpError(
            "Chi co the gan tai khoan dang hoat dong lam chu ho",
            422,
        );
    }
    if (!user.roles.includes("house_owner")) {
        throw new HttpError(
            "Nguoi dung duoc chon phai co vai tro Chu so huu",
            422,
        );
    }
    return user;
}

/**
 * Nem HttpError(404) neu houseId duoc chon khong ton tai, hoac HttpError(403)
 * neu actor khong nam trong pham vi cua nha so do (dung lai
 * assertHouseRecordInScope cua houseRecordService - admin: luon duoc; nhan
 * vien: theo assignedClusters; house_owner: chi duoc gan ho dan vao nha ma
 * chinh ho la chu so huu). Tra ve HouseRecord de goi noi dung derive
 * `cluster` tu do, thay vi tin gia tri client gui len.
 */
async function loadAccessibleHouseRecord(
    actorUser: IUser,
    houseId?: string | null,
) {
    if (!houseId) return null;
    const houseRecord = await HouseRecord.findById(houseId);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
    await assertHouseRecordInScope(actorUser, houseRecord);
    return houseRecord;
}

export async function createHousehold(
    actorUser: IUser,
    input: CreateHouseholdInput,
): Promise<IHousehold> {
    // Chu nha (house_owner) luon phai gan ho dan vao mot nha so co san - khong
    // con ly do de house_owner tu go cum dan cu rieng, vi ho dan phu thuoc vao
    // nha so va nha so da mang san cum dan cu cua no. Nhan vien/admin van
    // duoc tao ho dan "mo coi" (chua gan nha) de xu ly du lieu cu/nhap tay,
    // giong tinh nang gan nha so sau nay o man chi tiet nha (unassignedOnly).
    if (actorUser.roles.includes("house_owner") && !input.houseId) {
        throw new HttpError("Vui lòng chọn nhà số trước khi tạo hộ dân", 400);
    }

    const houseRecord = await loadAccessibleHouseRecord(
        actorUser,
        input.houseId,
    );
    if (houseRecord) {
        // Nha so phai da duoc xac thuc moi cho dang ky ho dan vao - tranh
        // truong hop dang ky trung lap/gia mao dia chi truoc khi nha so duoc
        // nhan vien duyet.
        assertHouseRecordVerifiedForMembers(actorUser, houseRecord);
    }
    // Cum dan cu/duong pho luon lay theo nha so lien ket (neu co) de tranh ho
    // dan va nha so lech nhau; chi khi khong co nha so lien ket (ho dan mo
    // coi, chi nhan vien/admin duoc tao) thi moi dung cluster/streetId client
    // gui len.
    const { cluster, streetId } = houseRecord
        ? {
              cluster: houseRecord.cluster,
              streetId: houseRecord.streetId
                  ? String(houseRecord.streetId)
                  : undefined,
          }
        : await resolveStreetClusterPair(input);
    if (!houseRecord) {
        assertClusterAssignable(actorUser, cluster);
    }
    // To dan pho luon lay theo nha so lien ket (neu co) - HouseRecord.neighborhoodId
    // duoc admin gan thu cong nen co the con trong voi nha chua duoc gan.
    const neighborhoodId = houseRecord?.neighborhoodId ?? undefined;

    // Neu co chon chu ho la mot tai khoan thuc su, dung ten hien thi cua tai
    // khoan do lam headOfHousehold (text) thay vi gia tri client gui - tranh
    // hai truong lech nhau.
    const headOfHouseholdUser = input.headOfHouseholdUserId
        ? await validateHeadOfHouseholdUser(input.headOfHouseholdUserId)
        : null;

    const code = await generateSequentialCode(Household, "HB", 3);
    const household = await Household.create({
        code,
        cluster,
        streetId,
        neighborhoodId,
        address: input.address,
        headOfHousehold: headOfHouseholdUser
            ? headOfHouseholdUser.displayName
            : input.headOfHousehold,
        headOfHouseholdUserId: headOfHouseholdUser?._id,
        phone: input.phone,
        // memberCount KHONG duoc gan tu input - luon bat dau tu 0 (mac dinh
        // schema) va chi duoc +1/-1 boi citizenService khi Citizen duoc them/
        // xoa/chuyen ho dan.
        ownershipType: input.ownershipType ?? "chinh_chu",
        needsSupport: input.needsSupport ?? false,
        houseId: input.houseId || undefined,
        note: input.note,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    if (headOfHouseholdUser && !headOfHouseholdUser.householdId) {
        await User.updateOne(
            { _id: headOfHouseholdUser._id },
            { householdId: household._id },
        );
    }
    if (headOfHouseholdUser) {
        await household.populate("headOfHouseholdUserId", "displayName phone");
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "household.create",
        targetModel: "Household",
        targetId: household._id,
        metadata: { code: household.code },
    });

    return household;
}

export async function listHouseholds(params: {
    page: number;
    limit: number;
    search?: string;
    cluster?: string;
    streetId?: string;
    houseId?: string;
    unassigned?: boolean;
    actorUser: IUser;
}) {
    const isAdminUser = params.actorUser.roles.includes("admin");
    const isHouseOwnerUser = params.actorUser.roles.includes("house_owner");
    const filter: Record<string, unknown> = {};

    if (params.houseId) {
        // Nguon goc houseId da duoc kiem tra quyen o route goi (vd nested
        // /api/houses/:id/households da assertHouseRecordInScope truoc do), nen ap
        // dung truc tiep, khong can loc lai theo house_owner/cluster o day.
        filter.houseId = params.houseId;
    } else if (params.unassigned && !isHouseOwnerUser) {
        // "Chua gan nha" chi co y nghia voi nhan vien (man gan ho dan co san) -
        // house_owner khong the co ho dan "mo coi" thuoc pham vi cua ho.
        filter.houseId = null;
    } else if (isHouseOwnerUser) {
        // House_owner (chu nha) chi duoc xem ho dan thuoc cac nha ma minh so huu -
        // KHONG duoc roi vao nhanh clusterScopeFilter ben duoi, vi house_owner
        // luon co assignedClusters rong va se bi hieu nham la "xem duoc toan phuong".
        const ownedHouseIds = await getOwnedHouseRecordIds(params.actorUser._id);
        filter.houseId = { $in: ownedHouseIds };
    }

    const isNeighborhoodLeader = params.actorUser.roles.includes(
        "neighborhood_leader",
    );
    if (isNeighborhoodLeader && !isHouseOwnerUser) {
        // To truong duoc scope theo Neighborhood, khong phai cluster - bo/thay
        // cluster/streetId query param (neu co) chi la loc bo sung, khong phai
        // co che phan quyen (khac voi nhanh cluster/streetId ben duoi).
        Object.assign(filter, areaScopeFilter(params.actorUser));
        if (params.streetId) filter.streetId = params.streetId;
        else if (params.cluster) filter.cluster = params.cluster;
    } else if ((params.cluster || params.streetId) && !isHouseOwnerUser) {
        const allowedClusters = params.actorUser.assignedClusters;
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
    } else if (!isHouseOwnerUser) {
        Object.assign(filter, clusterScopeFilter(params.actorUser));
    }

    if (params.search) {
        filter.$or = [
            { code: { $regex: params.search, $options: "i" } },
            { address: { $regex: params.search, $options: "i" } },
            { headOfHousehold: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        Household.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        Household.countDocuments(filter),
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
 * Tim ho dan cho nguoi dung tu chon ho khau cua minh (onboarding/doi ho khau) -
 * khong yeu cau quyen "households.read" (house_owner khong co quyen nay theo
 * mac dinh) va chi tra ve cac truong khong nhay cam. Neu khong truyen `cluster`
 * thi tim tren toan bo cac to dan pho (nguoi dung co the chua chon to dan pho).
 */
export async function searchHouseholdsForOnboarding(params: {
    page: number;
    limit: number;
    search?: string;
    cluster?: string;
}) {
    const filter: Record<string, unknown> = {};

    if (params.cluster) {
        filter.cluster = params.cluster;
    }

    if (params.search) {
        filter.$or = [
            { code: { $regex: params.search, $options: "i" } },
            { address: { $regex: params.search, $options: "i" } },
            { headOfHousehold: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        Household.find(filter)
            .select("code address cluster headOfHousehold memberCount")
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        Household.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getHouseholdById(id: string): Promise<IHousehold> {
    const household = await Household.findById(id).populate(
        "headOfHouseholdUserId",
        "displayName phone",
    );
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);
    return household;
}

/**
 * Kiem tra quyen truy cap ho dan:
 * - admin: luon duoc phep.
 * - chu nha (nha chua ho dan nay co ownerId trung actor): luon duoc phep.
 * - house_owner khac (khong phai chu nha): khong bao gio duoc phep - phai chan
 *   o day truoc, khong duoc roi xuong kiem tra cum ben duoi vi house_owner
 *   luon co assignedClusters rong nen se "lot" qua kiem tra do.
 * - nhan vien: theo assignedClusters nhu truoc (rong = xem toan phuong).
 */
export async function assertHouseholdInScope(
    user: IUser,
    household: IHousehold,
): Promise<void> {
    if (user.roles.includes("admin")) return;

    if (household.houseId) {
        const houseRecord = await HouseRecord.findById(household.houseId).select(
            "ownerId ownerType",
        );
        if (houseRecord) {
            const ownerActingUserId = await resolveOwnerActingUserId(houseRecord);
            if (
                ownerActingUserId &&
                String(ownerActingUserId) === String(user._id)
            ) {
                return;
            }
        }
    }

    if (user.roles.includes("house_owner")) {
        throw new HttpError(
            "Bạn không có quyền thao tác với hộ dân của người khác",
            403,
        );
    }

    if (user.roles.includes("neighborhood_leader")) {
        const ids = [user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])]
            .filter(Boolean)
            .map(String);
        if (!household.neighborhoodId || !ids.includes(String(household.neighborhoodId))) {
            throw new HttpError(
                "Ban khong co quyen thao tac voi ho dan ngoai to dan pho duoc phan cong",
                403,
            );
        }
        return;
    }

    if (
        user.assignedClusters?.length &&
        !user.assignedClusters.includes(household.cluster)
    ) {
        throw new HttpError(
            "Ban khong co quyen thao tac voi ho dan ngoai cum duoc phan cong",
            403,
        );
    }
}

/**
 * Tra ve id cac ho dan thuoc cac nha so ma user la chu so huu - dung boi
 * citizenService de loc nhan khau theo pham vi cua house_owner (chu nha).
 */
export async function getOwnedHouseholdIds(user: IUser) {
    const houseIds = await getOwnedHouseRecordIds(user._id);
    const households = await Household.find({
        houseId: { $in: houseIds },
    }).select("_id");
    return households.map(h => h._id);
}

export async function updateHousehold(
    actorUser: IUser,
    id: string,
    patch: UpdateHouseholdInput,
): Promise<IHousehold> {
    const household = await Household.findById(id);
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);

    // House_owner khong duoc go lien ket nha so khoi ho dan cua minh - ho dan
    // phu thuoc vao nha so, go lien ket se tao ra ho dan "mo coi" ma house_owner
    // (khong co assignedClusters) se khong con quan ly duoc nua.
    if (patch.houseId === null && actorUser.roles.includes("house_owner")) {
        throw new HttpError(
            "Hộ dân phải luôn được liên kết với một nhà số",
            400,
        );
    }

    // houseId hieu luc sau khi ap dung patch: gia tri moi neu co truyen len
    // (ke ca null = go lien ket), nguoc lai giu nguyen gia tri hien tai.
    const effectiveHouseId =
        patch.houseId !== undefined ? patch.houseId : household.houseId;

    if (effectiveHouseId) {
        const houseRecord = await loadAccessibleHouseRecord(
            actorUser,
            String(effectiveHouseId),
        );
        if (patch.houseId) {
            // Dang gan/doi sang mot nha so moi cho ho dan - nha do phai da
            // duoc xac thuc (khong ap dung khi houseId khong doi, de tranh
            // chan cac chinh sua khac cua ho dan da co san neu nha so sau nay
            // bi doi trang thai boi admin).
            assertHouseRecordVerifiedForMembers(actorUser, houseRecord!);
        }
        // Cum dan cu/duong pho luon dong bo theo nha so lien ket (moi hoac giu
        // nguyen), bo qua bat ky gia tri cluster/streetId nao client gui kem
        // trong patch.
        patch = {
            ...patch,
            cluster: houseRecord!.cluster,
            streetId: houseRecord!.streetId
                ? String(houseRecord!.streetId)
                : undefined,
        };
        // neighborhoodId khong nam trong UpdateHouseholdInput (client khong duoc
        // gui truc tiep) - dong bo rieng tu HouseRecord ngay tren document, vi
        // vong lap Object.entries(patch) ben duoi chi ap gia tri co trong patch.
        household.neighborhoodId = houseRecord!.neighborhoodId;
    } else if (patch.cluster !== undefined || patch.streetId !== undefined) {
        const resolved = await resolveStreetClusterPair(patch);
        assertClusterAssignable(actorUser, resolved.cluster);
        patch = { ...patch, cluster: resolved.cluster, streetId: resolved.streetId };
    }

    // headOfHouseholdUserId: null = go lien ket (giu nguyen headOfHousehold
    // text hien tai), string = lien ket toi tai khoan house_owner hop le va
    // dong bo lai headOfHousehold tu displayName cua tai khoan do.
    if (patch.headOfHouseholdUserId) {
        const headOfHouseholdUser = await validateHeadOfHouseholdUser(
            patch.headOfHouseholdUserId,
        );
        patch = {
            ...patch,
            headOfHouseholdUserId: String(headOfHouseholdUser._id),
            headOfHousehold: patch.headOfHousehold ?? headOfHouseholdUser.displayName,
        };
        if (!headOfHouseholdUser.householdId) {
            await User.updateOne(
                { _id: headOfHouseholdUser._id },
                { householdId: household._id },
            );
        }
    }

    // Chi gan cac truong thuc su co mat trong patch (partial schema van tra ve
    // day du key voi gia tri undefined cho truong khong duoc gui len).
    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (household as unknown as Record<string, unknown>)[key] = value;
        }
    }
    household.updatedBy = actorUser._id as any;
    await household.save();
    if (household.headOfHouseholdUserId) {
        await household.populate("headOfHouseholdUserId", "displayName phone");
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "household.update",
        targetModel: "Household",
        targetId: household._id,
        metadata: patch,
    });

    return household;
}

export async function deleteHousehold(
    actorId: string,
    id: string,
): Promise<IHousehold> {
    const household = await Household.findById(id);
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);

    const linkedCitizenCount = await Citizen.countDocuments({
        householdId: id,
    });
    if (linkedCitizenCount > 0) {
        throw new HttpError(
            "Khong the xoa ho dan vi van con nhan khau lien ket, vui long chuyen hoac xoa nhan khau truoc",
            409,
        );
    }

    await household.deleteOne();

    await writeAuditLog({
        actorId,
        action: "household.delete",
        targetModel: "Household",
        targetId: id,
        metadata: { code: household.code },
    });

    return household;
}
