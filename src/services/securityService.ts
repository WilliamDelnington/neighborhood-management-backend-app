import { HouseRecord, SecurityRecord, type ISecurityRecord } from "@/models";
import type { IUser } from "@/models/User";
import { HttpError } from "@/lib/response";
import { clusterScopeFilter } from "@/lib/rbac";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { MUC_DO_AN_NINH_LABEL } from "@/types";
import type {
    AssignSecurityRecordInput,
    CreateSecurityRecordInput,
    UpdateSecurityRecordInput,
} from "@/validators/security";

const UPDATABLE_BOOLEAN_FIELDS = [
    "hasCamera",
    "hasSecurityComplaint",
    "reportedToPolice",
] as const;

const HOUSE_POPULATE_FIELDS = "code address cluster residenceDeclarationNumber";

async function notifyUrgentLevel(
    record: ISecurityRecord,
    house: { code: string; address: string },
    actorId: string,
) {
    await createNotification({
        title: "Cảnh báo an ninh khẩn cấp",
        body: `Nhà ${house.code} (${house.address}) đang ở mức an ninh: ${MUC_DO_AN_NINH_LABEL.khan_cap}`,
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
    const house = await HouseRecord.findById(input.houseId).select(
        "_id code address",
    );
    if (!house) throw new HttpError("Khong tim thay nha", 404);

    const record = await SecurityRecord.create({
        houseId: input.houseId,
        ownershipType: input.ownershipType,
        renterCount: input.renterCount,
        hasCamera: input.hasCamera,
        hasSecurityComplaint: input.hasSecurityComplaint,
        level: input.level,
        reportedToPolice: input.reportedToPolice,
        monitoringStatus: input.monitoringStatus,
        note: input.note,
        inspectionDate: new Date(input.inspectionDate),
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "security.create",
        targetModel: "SecurityRecord",
        targetId: record._id,
        metadata: { houseId: input.houseId, level: record.level },
    });

    if (record.level === "khan_cap") {
        await notifyUrgentLevel(record, house, String(actorUser._id));
    }

    return record;
}

export async function listSecurityRecords(params: {
    page: number;
    limit: number;
    level?: string;
    houseId?: string;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};
    if (params.level) filter.level = params.level;

    if (params.houseId) {
        filter.houseId = params.houseId;
    } else if (!params.actorUser.roles.includes("admin")) {
        const scopeFilter = clusterScopeFilter(params.actorUser);
        if (Object.keys(scopeFilter).length > 0) {
            const houses = await HouseRecord.find(scopeFilter).select("_id");
            filter.houseId = { $in: houses.map(h => h._id) };
        }
    }

    const [items, total] = await Promise.all([
        SecurityRecord.find(filter)
            .sort({ updatedAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("houseId", HOUSE_POPULATE_FIELDS)
            .populate("updatedBy", "displayName")
            .populate("createdBy", "displayName")
            .populate("assigneeId", "displayName"),
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
        .populate("houseId", HOUSE_POPULATE_FIELDS)
        .populate("updatedBy", "displayName")
        .populate("createdBy", "displayName")
        .populate("assigneeId", "displayName");
    if (!record) throw new HttpError("Khong tim thay ho so an ninh", 404);
    return record;
}

/**
 * Kiem tra quyen truy cap ho so an ninh theo cum dan cu cua nha lien quan.
 * Nem HttpError(403) neu user khong phai admin va cum cua nha khong nam trong assignedClusters.
 */
export function assertSecurityRecordInScope(
    user: IUser,
    record: { houseId: unknown },
): void {
    if (user.roles.includes("admin")) return;
    if (!user.assignedClusters?.length) return;
    const house = record.houseId as {
        cluster?: string;
    } | null;
    const cluster = house && typeof house === "object" ? house.cluster : undefined;
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

    if (patch.houseId !== undefined) {
        const house = await HouseRecord.findById(patch.houseId).select("_id");
        if (!house) throw new HttpError("Khong tim thay nha", 404);
        record.houseId = patch.houseId as unknown as typeof record.houseId;
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
    if (patch.monitoringStatus !== undefined)
        record.monitoringStatus = patch.monitoringStatus;
    if (patch.note !== undefined) record.note = patch.note;
    if (patch.inspectionDate !== undefined)
        record.inspectionDate = new Date(patch.inspectionDate);
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
        const house = await HouseRecord.findById(record.houseId).select(
            "code address",
        );
        if (house) await notifyUrgentLevel(record, house, String(actorUser._id));
    }

    return record;
}

export async function assignSecurityRecord(
    actorId: string,
    id: string,
    input: AssignSecurityRecordInput,
) {
    const record = await SecurityRecord.findById(id);
    if (!record) throw new HttpError("Khong tim thay ho so an ninh", 404);

    record.assigneeId = input.assigneeId as unknown as typeof record.assigneeId;
    await record.save();

    const house = await HouseRecord.findById(record.houseId).select(
        "code address",
    );

    await createNotification({
        title: "Bạn được giao theo dõi hồ sơ an ninh, tạm trú",
        body: house
            ? `Nhà ${house.code} (${house.address})`
            : "Bạn được giao theo dõi một hồ sơ an ninh, tạm trú",
        type: "security.assigned",
        targetUserIds: [input.assigneeId],
        relatedModel: "SecurityRecord",
        relatedId: record._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "security.assign",
        targetModel: "SecurityRecord",
        targetId: record._id,
        metadata: { assigneeId: input.assigneeId },
    });

    return getSecurityRecordById(String(record._id));
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
