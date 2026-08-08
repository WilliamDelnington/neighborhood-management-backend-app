import { HouseRecord, ResidentRecord } from "@/models";
import type { IUser } from "@/models/User";
import { HttpError } from "@/lib/response";
import { areaScopeFilter } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateResidentRecordInput,
    UpdateResidentRecordInput,
} from "@/validators/resident";

const HOUSE_POPULATE_FIELDS =
    "code address cluster neighborhoodId residenceDeclarationNumber";

export async function createResidentRecord(
    actorUser: IUser,
    input: CreateResidentRecordInput,
) {
    const house = await HouseRecord.findById(input.houseId).select("_id");
    if (!house) throw new HttpError("Khong tim thay nha", 404);

    const record = await ResidentRecord.create({
        houseId: input.houseId,
        ownershipType: input.ownershipType,
        renterCount: input.renterCount,
        inspectionDate: new Date(input.inspectionDate),
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "resident.create",
        targetModel: "ResidentRecord",
        targetId: record._id,
        metadata: { houseId: input.houseId },
    });

    return record;
}

export async function listResidentRecords(params: {
    page: number;
    limit: number;
    houseId?: string;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};

    if (params.houseId) {
        filter.houseId = params.houseId;
    } else if (!params.actorUser.roles.includes("admin")) {
        const scopeFilter = areaScopeFilter(params.actorUser);
        if (Object.keys(scopeFilter).length > 0) {
            const houses = await HouseRecord.find(scopeFilter).select("_id");
            filter.houseId = { $in: houses.map(h => h._id) };
        }
    }

    const [items, total] = await Promise.all([
        ResidentRecord.find(filter)
            .sort({ updatedAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("houseId", HOUSE_POPULATE_FIELDS)
            .populate("updatedBy", "displayName")
            .populate("createdBy", "displayName"),
        ResidentRecord.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getResidentRecordById(id: string) {
    const record = await ResidentRecord.findById(id)
        .populate("houseId", HOUSE_POPULATE_FIELDS)
        .populate("updatedBy", "displayName")
        .populate("createdBy", "displayName");
    if (!record) throw new HttpError("Khong tim thay ho so cu tru", 404);
    return record;
}

/**
 * Kiem tra quyen truy cap ho so cu tru theo cum dan cu cua nha lien quan -
 * dong nhat voi assertSecurityRecordInScope (securityService.ts) truoc khi
 * tach doi.
 */
export function assertResidentRecordInScope(
    user: IUser,
    record: { houseId: unknown },
): void {
    if (user.roles.includes("admin")) return;
    const house = record.houseId as {
        cluster?: string;
        neighborhoodId?: unknown;
    } | null;

    if (user.roles.includes("neighborhood_leader")) {
        const ids = [user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])]
            .filter(Boolean)
            .map(String);
        const neighborhoodId =
            house && typeof house === "object" ? house.neighborhoodId : undefined;
        if (!neighborhoodId || !ids.includes(String(neighborhoodId))) {
            throw new HttpError(
                "Ban khong co quyen thao tac voi ho so ngoai to dan pho duoc phan cong",
                403,
            );
        }
        return;
    }

    if (!user.assignedClusters?.length) return;
    const cluster = house && typeof house === "object" ? house.cluster : undefined;
    if (cluster && !user.assignedClusters.includes(cluster)) {
        throw new HttpError(
            "Ban khong co quyen thao tac voi ho so ngoai cum duoc phan cong",
            403,
        );
    }
}

export async function updateResidentRecord(
    actorUser: IUser,
    id: string,
    patch: UpdateResidentRecordInput,
) {
    const record = await ResidentRecord.findById(id);
    if (!record) throw new HttpError("Khong tim thay ho so cu tru", 404);

    if (patch.houseId !== undefined) {
        const house = await HouseRecord.findById(patch.houseId).select("_id");
        if (!house) throw new HttpError("Khong tim thay nha", 404);
        record.houseId = patch.houseId as unknown as typeof record.houseId;
    }
    if (patch.ownershipType !== undefined)
        record.ownershipType = patch.ownershipType;
    if (patch.renterCount !== undefined) record.renterCount = patch.renterCount;
    if (patch.inspectionDate !== undefined)
        record.inspectionDate = new Date(patch.inspectionDate);
    record.updatedBy = actorUser._id as unknown as typeof record.updatedBy;

    await record.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "resident.update",
        targetModel: "ResidentRecord",
        targetId: record._id,
        metadata: { patch },
    });

    return record;
}

export async function deleteResidentRecord(actorId: string, id: string) {
    const record = await ResidentRecord.findByIdAndDelete(id);
    if (!record) throw new HttpError("Khong tim thay ho so cu tru", 404);

    await writeAuditLog({
        actorId,
        action: "resident.delete",
        targetModel: "ResidentRecord",
        targetId: id,
    });

    return record;
}
