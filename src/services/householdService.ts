import { Household, Citizen, type IHousehold, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { generateSequentialCode } from "@/lib/utils";
import { clusterScopeFilter } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateHouseholdInput,
    UpdateHouseholdInput,
} from "@/validators/household";

/**
 * Nem HttpError(403) neu actor khong phai admin va cluster truyen vao khong
 * nam trong assignedClusters cua actor - dung khi tao/doi cluster cua ho dan,
 * de tranh tao ra ho dan "mo coi" ma chinh nguoi tao cung khong con thay duoc
 * (vi clusterScopeFilter se loc theo assignedClusters cho cac truy van sau do).
 */
function assertClusterAssignable(actorUser: IUser, cluster: string): void {
    if (actorUser.roles.includes("admin")) return;
    if (!actorUser.assignedClusters?.includes(cluster)) {
        throw new HttpError(
            "Cụm dân cư không thuộc phạm vi quản lý của bạn",
            403,
        );
    }
}

export async function createHousehold(
    actorUser: IUser,
    input: CreateHouseholdInput,
): Promise<IHousehold> {
    assertClusterAssignable(actorUser, input.cluster);

    const code = await generateSequentialCode(Household, "HB", 3);
    const household = await Household.create({
        code,
        cluster: input.cluster,
        address: input.address,
        headOfHousehold: input.headOfHousehold,
        phone: input.phone,
        memberCount: input.memberCount ?? 0,
        ownershipType: input.ownershipType ?? "chinh_chu",
        needsSupport: input.needsSupport ?? false,
        note: input.note,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

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
    actorUser: IUser;
}) {
    const isAdminUser = params.actorUser.roles.includes("admin");
    const filter: Record<string, unknown> = {};

    if (params.cluster) {
        const allowedClusters = params.actorUser.assignedClusters;
        if (
            !isAdminUser &&
            allowedClusters?.length &&
            !allowedClusters.includes(params.cluster)
        ) {
            throw new HttpError("Ban khong co quyen xem cum dan cu nay", 403);
        }
        filter.cluster = params.cluster;
    } else {
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
 * khong yeu cau quyen "households.read" (resident khong co quyen nay theo mac
 * dinh) va chi tra ve cac truong khong nhay cam. Neu khong truyen `cluster`
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
    const household = await Household.findById(id);
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);
    return household;
}

/**
 * Kiem tra quyen truy cap ho dan theo cum dan cu duoc phan cong.
 * Nem HttpError(403) neu user khong phai admin va cum cua ho khong nam trong assignedClusters.
 */
export function assertHouseholdInScope(
    user: IUser,
    household: IHousehold,
): void {
    if (user.roles.includes("admin")) return;
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

export async function updateHousehold(
    actorUser: IUser,
    id: string,
    patch: UpdateHouseholdInput,
): Promise<IHousehold> {
    const household = await Household.findById(id);
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);

    if (patch.cluster !== undefined) {
        assertClusterAssignable(actorUser, patch.cluster);
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
