import { Citizen, Household, type ICitizen, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { clusterScopeFilter } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateCitizenInput,
    UpdateCitizenInput,
} from "@/validators/citizen";

export const CITIZEN_WRITE_ROLES = ["admin", "neighborhood_leader"] as const;

export const CITIZEN_READ_ROLES = [
    "admin",
    "neighborhood_leader",
    "secretary",
    "regional_police",
    "people_committee_official",
] as const;

/**
 * Tinh lai memberCount cua mot ho dan dua tren so nhan khau hien co.
 */
async function recomputeHouseholdMemberCount(
    householdId: unknown,
): Promise<void> {
    const count = await Citizen.countDocuments({ householdId });
    await Household.findByIdAndUpdate(householdId, { memberCount: count });
}

export async function createCitizen(
    actorId: string,
    input: CreateCitizenInput,
): Promise<ICitizen> {
    const household = await Household.findById(input.householdId);
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);

    const citizen = await Citizen.create({
        fullName: input.fullName,
        phone: input.phone,
        cccd: input.cccd,
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
        gender: input.gender ?? "nam",
        relationToHead: input.relationToHead,
        householdId: input.householdId,
        residenceType: input.residenceType ?? "thuong_tru",
        isElderly: input.isElderly ?? false,
        isChild: input.isChild ?? false,
        isDisabledOrSupportNeeded: input.isDisabledOrSupportNeeded ?? false,
        isPartyMember: input.isPartyMember ?? false,
        isUnionMember: input.isUnionMember ?? false,
        zaloUserId: input.zaloUserId,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await recomputeHouseholdMemberCount(input.householdId);

    await writeAuditLog({
        actorId,
        action: "citizen.create",
        targetModel: "Citizen",
        targetId: citizen._id,
        metadata: { householdId: input.householdId },
    });

    return citizen;
}

export async function listCitizens(params: {
    page: number;
    limit: number;
    search?: string;
    householdId?: string;
    actorUser: IUser;
}) {
    const isAdminUser = params.actorUser.roles.includes("admin");
    const filter: Record<string, unknown> = {};

    if (params.householdId) {
        if (!isAdminUser) {
            const household = await Household.findById(
                params.householdId,
            ).select("cluster");
            if (!household) throw new HttpError("Khong tim thay ho dan", 404);
            const allowedClusters = params.actorUser.assignedClusters;
            if (
                allowedClusters?.length &&
                !allowedClusters.includes(household.cluster)
            ) {
                throw new HttpError(
                    "Ban khong co quyen xem nhan khau cua ho nay",
                    403,
                );
            }
        }
        filter.householdId = params.householdId;
    } else if (!isAdminUser) {
        const scope = clusterScopeFilter(params.actorUser);
        if (Object.keys(scope).length > 0) {
            const allowedHouseholds = await Household.find(scope).select("_id");
            filter.householdId = { $in: allowedHouseholds.map(h => h._id) };
        }
    }

    if (params.search) {
        filter.$or = [
            { fullName: { $regex: params.search, $options: "i" } },
            { cccd: { $regex: params.search, $options: "i" } },
            { phone: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        Citizen.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("householdId", "code address cluster"),
        Citizen.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getCitizenById(id: string): Promise<ICitizen> {
    const citizen = await Citizen.findById(id).populate(
        "householdId",
        "code address cluster",
    );
    if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);
    return citizen;
}

export async function updateCitizen(
    actorId: string,
    id: string,
    patch: UpdateCitizenInput,
): Promise<ICitizen> {
    const citizen = await Citizen.findById(id);
    if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);

    const oldHouseholdId = String(citizen.householdId);
    let newHouseholdId = oldHouseholdId;

    if (patch.householdId && patch.householdId !== oldHouseholdId) {
        const newHousehold = await Household.findById(patch.householdId);
        if (!newHousehold)
            throw new HttpError("Khong tim thay ho dan moi", 404);
        newHouseholdId = patch.householdId;
    }

    // Chi gan cac truong thuc su co mat trong patch (partial schema van tra ve
    // day du key voi gia tri undefined cho truong khong duoc gui len).
    const { birthDate, ...rest } = patch;
    for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
            (citizen as unknown as Record<string, unknown>)[key] = value;
        }
    }
    if (birthDate !== undefined) {
        citizen.birthDate = birthDate ? new Date(birthDate) : undefined;
    }
    citizen.updatedBy = actorId as any;
    await citizen.save();

    if (newHouseholdId !== oldHouseholdId) {
        await recomputeHouseholdMemberCount(oldHouseholdId);
        await recomputeHouseholdMemberCount(newHouseholdId);
    }

    await writeAuditLog({
        actorId,
        action: "citizen.update",
        targetModel: "Citizen",
        targetId: citizen._id,
        metadata: patch,
    });

    return citizen;
}

export async function deleteCitizen(
    actorId: string,
    id: string,
): Promise<ICitizen> {
    const citizen = await Citizen.findById(id);
    if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);

    const householdId = citizen.householdId;
    await citizen.deleteOne();
    await recomputeHouseholdMemberCount(householdId);

    await writeAuditLog({
        actorId,
        action: "citizen.delete",
        targetModel: "Citizen",
        targetId: id,
        metadata: { householdId },
    });

    return citizen;
}
