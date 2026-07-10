import { Household, PcccCheck, type IPcccCheck } from "@/models";
import type { IUser } from "@/models/User";
import { HttpError } from "@/lib/response";
import { clusterScopeFilter } from "@/lib/rbac";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { MUC_NGUY_CO_PCCC_LABEL } from "@/types";
import type {
    CreatePcccCheckInput,
    UpdatePcccCheckInput,
} from "@/validators/pccc";

export const PCCC_WRITE_ROLES = [
    "admin",
    "neighborhood_leader",
    "regional_police",
] as const;
export const PCCC_READ_ROLES = [
    "admin",
    "neighborhood_leader",
    "regional_police",
    "people_committee_official",
] as const;

const UPDATABLE_BOOLEAN_FIELDS = [
    "hasFireExtinguisher",
    "hasEmergencyExit",
    "hasIndoorEvCharging",
    "hasGasStoveOrStorageOrBusiness",
    "isCrowdedRental",
] as const;

async function notifyHighRisk(
    check: IPcccCheck,
    household: { code: string; address: string },
    actorId: string,
) {
    await createNotification({
        title: "Phát hiện nguy cơ PCCC cao",
        body: `Hộ ${household.code} (${household.address}) đang ở mức nguy cơ PCCC: ${MUC_NGUY_CO_PCCC_LABEL.do}`,
        type: "pccc.high_risk",
        targetRoles: ["admin", "neighborhood_leader"],
        relatedModel: "PcccCheck",
        relatedId: check._id,
        createdBy: actorId,
    });
}

export async function createPcccCheck(
    actorUser: IUser,
    input: CreatePcccCheckInput,
) {
    const household = await Household.findById(input.householdId).select(
        "_id code address",
    );
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);

    const inspectorId =
        input.inspectorId && actorUser.roles.includes("admin")
            ? input.inspectorId
            : String(actorUser._id);

    const check = await PcccCheck.create({
        householdId: input.householdId,
        hasFireExtinguisher: input.hasFireExtinguisher,
        hasEmergencyExit: input.hasEmergencyExit,
        hasIndoorEvCharging: input.hasIndoorEvCharging,
        hasGasStoveOrStorageOrBusiness: input.hasGasStoveOrStorageOrBusiness,
        isCrowdedRental: input.isCrowdedRental,
        riskLevel: input.riskLevel,
        remediationNeeded: input.remediationNeeded,
        inspectionDate: new Date(input.inspectionDate),
        inspectorId,
        followUpStatus: input.followUpStatus,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "pccc.create",
        targetModel: "PcccCheck",
        targetId: check._id,
        metadata: {
            householdId: input.householdId,
            riskLevel: check.riskLevel,
        },
    });

    if (check.riskLevel === "do") {
        await notifyHighRisk(check, household, String(actorUser._id));
    }

    return check;
}

export async function listPcccChecks(params: {
    page: number;
    limit: number;
    riskLevel?: string;
    householdId?: string;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};
    if (params.riskLevel) filter.riskLevel = params.riskLevel;

    if (params.householdId) {
        filter.householdId = params.householdId;
    } else if (!params.actorUser.roles.includes("admin")) {
        const scopeFilter = clusterScopeFilter(params.actorUser);
        if (Object.keys(scopeFilter).length > 0) {
            const households = await Household.find(scopeFilter).select("_id");
            filter.householdId = { $in: households.map(h => h._id) };
        }
    }

    const [items, total] = await Promise.all([
        PcccCheck.find(filter)
            .sort({ inspectionDate: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("householdId", "code address cluster")
            .populate("inspectorId", "displayName"),
        PcccCheck.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getPcccCheckById(id: string) {
    const check = await PcccCheck.findById(id)
        .populate("householdId", "code address cluster")
        .populate("inspectorId", "displayName");
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);
    return check;
}

/**
 * Kiem tra quyen truy cap bien ban PCCC theo cum dan cu cua ho khau lien quan.
 * Nem HttpError(403) neu user khong phai admin va cum cua ho khong nam trong assignedClusters.
 */
export function assertPcccCheckInScope(
    user: IUser,
    check: { householdId: unknown },
): void {
    if (user.roles.includes("admin")) return;
    if (!user.assignedClusters?.length) return;
    const household = check.householdId as {
        cluster?: string;
    } | null;
    const cluster = household && typeof household === "object" ? household.cluster : undefined;
    if (cluster && !user.assignedClusters.includes(cluster)) {
        throw new HttpError(
            "Ban khong co quyen thao tac voi bien ban ngoai cum duoc phan cong",
            403,
        );
    }
}

export async function updatePcccCheck(
    actorUser: IUser,
    id: string,
    patch: UpdatePcccCheckInput,
) {
    const check = await PcccCheck.findById(id);
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);

    const previousRiskLevel = check.riskLevel;

    if (patch.householdId !== undefined) {
        const household = await Household.findById(patch.householdId).select(
            "_id",
        );
        if (!household) throw new HttpError("Khong tim thay ho dan", 404);
        check.householdId =
            patch.householdId as unknown as typeof check.householdId;
    }

    for (const field of UPDATABLE_BOOLEAN_FIELDS) {
        if (patch[field] !== undefined) {
            check[field] = patch[field] as boolean;
        }
    }
    if (patch.riskLevel !== undefined) check.riskLevel = patch.riskLevel;
    if (patch.remediationNeeded !== undefined)
        check.remediationNeeded = patch.remediationNeeded;
    if (patch.followUpStatus !== undefined)
        check.followUpStatus = patch.followUpStatus;
    if (patch.inspectionDate !== undefined)
        check.inspectionDate = new Date(patch.inspectionDate);
    if (patch.inspectorId !== undefined && actorUser.roles.includes("admin")) {
        check.inspectorId =
            patch.inspectorId as unknown as typeof check.inspectorId;
    }

    await check.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "pccc.update",
        targetModel: "PcccCheck",
        targetId: check._id,
        metadata: { patch },
    });

    if (check.riskLevel === "do" && previousRiskLevel !== "do") {
        const household = await Household.findById(check.householdId).select(
            "code address",
        );
        if (household)
            await notifyHighRisk(check, household, String(actorUser._id));
    }

    return check;
}

export async function deletePcccCheck(actorId: string, id: string) {
    const check = await PcccCheck.findByIdAndDelete(id);
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);

    await writeAuditLog({
        actorId,
        action: "pccc.delete",
        targetModel: "PcccCheck",
        targetId: id,
    });

    return check;
}

export async function getHouseholdRiskSummary() {
    const result = await PcccCheck.aggregate([
        { $sort: { inspectionDate: -1 } },
        {
            $group: {
                _id: "$householdId",
                riskLevel: { $first: "$riskLevel" },
            },
        },
        { $group: { _id: "$riskLevel", count: { $sum: 1 } } },
    ]);

    const summary: Record<string, number> = { xanh: 0, vang: 0, do: 0 };
    for (const row of result as { _id: string; count: number }[]) {
        if (row._id) summary[row._id] = row.count;
    }
    return summary;
}
