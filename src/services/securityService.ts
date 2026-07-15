import { Household, SecurityRecord, type ISecurityRecord } from "@/models";
import type { IUser } from "@/models/User";
import { HttpError } from "@/lib/response";
import { clusterScopeFilter } from "@/lib/rbac";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { MUC_DO_AN_NINH_LABEL } from "@/types";
import type {
    CreateSecurityRecordInput,
    UpdateSecurityRecordInput,
} from "@/validators/security";

const UPDATABLE_BOOLEAN_FIELDS = [
    "temporaryResidenceDeclared",
    "hasCamera",
    "hasSecurityComplaint",
    "reportedToPolice",
] as const;

async function notifyUrgentLevel(
    record: ISecurityRecord,
    household: { code: string; address: string },
    actorId: string,
) {
    await createNotification({
        title: "Cảnh báo an ninh khẩn cấp",
        body: `Hộ ${household.code} (${household.address}) đang ở mức an ninh: ${MUC_DO_AN_NINH_LABEL.khan_cap}`,
        type: "security.urgent",
        targetRoles: ["admin", "regional_police"],
        relatedModel: "SecurityRecord",
        relatedId: record._id,
        createdBy: actorId,
    });
}

export async function createSecurityRecord(
    actorUser: IUser,
    input: CreateSecurityRecordInput,
) {
    const household = await Household.findById(input.householdId).select(
        "_id code address",
    );
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);

    const record = await SecurityRecord.create({
        householdId: input.householdId,
        ownershipType: input.ownershipType,
        renterCount: input.renterCount,
        temporaryResidenceDeclared: input.temporaryResidenceDeclared,
        hasCamera: input.hasCamera,
        hasSecurityComplaint: input.hasSecurityComplaint,
        level: input.level,
        reportedToPolice: input.reportedToPolice,
        handlingStatus: input.handlingStatus,
        note: input.note,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "security.create",
        targetModel: "SecurityRecord",
        targetId: record._id,
        metadata: { householdId: input.householdId, level: record.level },
    });

    if (record.level === "khan_cap") {
        await notifyUrgentLevel(record, household, String(actorUser._id));
    }

    return record;
}

export async function listSecurityRecords(params: {
    page: number;
    limit: number;
    level?: string;
    householdId?: string;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};
    if (params.level) filter.level = params.level;

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
        SecurityRecord.find(filter)
            .sort({ updatedAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("householdId", "code address cluster")
            .populate("updatedBy", "displayName"),
        SecurityRecord.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getSecurityRecordById(id: string) {
    const record = await SecurityRecord.findById(id)
        .populate("householdId", "code address cluster")
        .populate("updatedBy", "displayName");
    if (!record) throw new HttpError("Khong tim thay ho so an ninh", 404);
    return record;
}

/**
 * Kiem tra quyen truy cap ho so an ninh theo cum dan cu cua ho khau lien quan.
 * Nem HttpError(403) neu user khong phai admin va cum cua ho khong nam trong assignedClusters.
 */
export function assertSecurityRecordInScope(
    user: IUser,
    record: { householdId: unknown },
): void {
    if (user.roles.includes("admin")) return;
    if (!user.assignedClusters?.length) return;
    const household = record.householdId as {
        cluster?: string;
    } | null;
    const cluster = household && typeof household === "object" ? household.cluster : undefined;
    if (cluster && !user.assignedClusters.includes(cluster)) {
        throw new HttpError(
            "Ban khong co quyen thao tac voi ho so ngoai cum duoc phan cong",
            403,
        );
    }
}

export async function updateSecurityRecord(
    actorUser: IUser,
    id: string,
    patch: UpdateSecurityRecordInput,
) {
    const record = await SecurityRecord.findById(id);
    if (!record) throw new HttpError("Khong tim thay ho so an ninh", 404);

    const previousLevel = record.level;

    if (patch.householdId !== undefined) {
        const household = await Household.findById(patch.householdId).select(
            "_id",
        );
        if (!household) throw new HttpError("Khong tim thay ho dan", 404);
        record.householdId =
            patch.householdId as unknown as typeof record.householdId;
    }

    for (const field of UPDATABLE_BOOLEAN_FIELDS) {
        if (patch[field] !== undefined) {
            record[field] = patch[field] as boolean;
        }
    }
    if (patch.ownershipType !== undefined)
        record.ownershipType = patch.ownershipType;
    if (patch.renterCount !== undefined) record.renterCount = patch.renterCount;
    if (patch.level !== undefined) record.level = patch.level;
    if (patch.handlingStatus !== undefined)
        record.handlingStatus = patch.handlingStatus;
    if (patch.note !== undefined) record.note = patch.note;
    record.updatedBy = actorUser._id as unknown as typeof record.updatedBy;

    await record.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "security.update",
        targetModel: "SecurityRecord",
        targetId: record._id,
        metadata: { patch },
    });

    if (record.level === "khan_cap" && previousLevel !== "khan_cap") {
        const household = await Household.findById(record.householdId).select(
            "code address",
        );
        if (household)
            await notifyUrgentLevel(record, household, String(actorUser._id));
    }

    return record;
}

export async function deleteSecurityRecord(actorId: string, id: string) {
    const record = await SecurityRecord.findByIdAndDelete(id);
    if (!record) throw new HttpError("Khong tim thay ho so an ninh", 404);

    await writeAuditLog({
        actorId,
        action: "security.delete",
        targetModel: "SecurityRecord",
        targetId: id,
    });

    return record;
}
