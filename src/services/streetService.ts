import {
    Street,
    type IStreet,
    HouseRecord,
    Household,
    Business,
    Company,
    Neighborhood,
    ScopeAssignment,
    NeighborhoodCollaboratorAssignment,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type { CreateStreetInput, UpdateStreetInput } from "@/validators/street";

export async function listStreets(params: {
    page: number;
    limit: number;
    search?: string;
    active?: boolean;
}) {
    const filter: Record<string, unknown> = {};

    if (params.active !== undefined) filter.active = params.active;
    if (params.search) {
        filter.$or = [
            { name: { $regex: params.search, $options: "i" } },
            { code: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        Street.find(filter)
            .sort({ name: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        Street.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getStreetById(id: string): Promise<IStreet> {
    const street = await Street.findById(id);
    if (!street) throw new HttpError("Không tìm thấy đường/phố", 404);
    return street;
}

export async function createStreet(
    actorId: string,
    input: CreateStreetInput,
): Promise<IStreet> {
    const existing = await Street.findOne({ code: input.code });
    if (existing) {
        throw new HttpError("Mã đường/phố đã tồn tại", 409);
    }

    const street = await Street.create({
        ...input,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "street.create",
        targetModel: "Street",
        targetId: street._id,
        metadata: { code: street.code, name: street.name },
    });

    return street;
}

export async function updateStreet(
    actorId: string,
    id: string,
    patch: UpdateStreetInput,
): Promise<IStreet> {
    const street = await Street.findById(id);
    if (!street) throw new HttpError("Không tìm thấy đường/phố", 404);

    const priorState = street.toObject();
    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (street as unknown as Record<string, unknown>)[key] = value;
        }
    }
    street.updatedBy = actorId as any;
    await street.save();

    await writeAuditLog({
        actorId,
        action: "street.update",
        targetModel: "Street",
        targetId: street._id,
        metadata: { before: priorState, after: patch },
    });

    return street;
}

export async function deleteStreet(actorId: string, id: string): Promise<void> {
    const street = await Street.findById(id);
    if (!street) throw new HttpError("Không tìm thấy đường/phố", 404);

    const [
        houseRecordCount,
        householdCount,
        businessCount,
        companyCount,
        neighborhoodCount,
        scopeAssignmentCount,
        collaboratorAssignmentCount,
    ] = await Promise.all([
        HouseRecord.countDocuments({ streetId: id }),
        Household.countDocuments({ streetId: id }),
        Business.countDocuments({ streetId: id }),
        Company.countDocuments({ streetId: id }),
        Neighborhood.countDocuments({ streetIds: id }),
        ScopeAssignment.countDocuments({ "subScope.streetId": id }),
        NeighborhoodCollaboratorAssignment.countDocuments({ streetId: id }),
    ]);

    const totalReferences =
        houseRecordCount +
        householdCount +
        businessCount +
        companyCount +
        neighborhoodCount +
        scopeAssignmentCount +
        collaboratorAssignmentCount;

    if (totalReferences > 0) {
        throw new HttpError(
            "Không thể xóa đường/phố đang được sử dụng bởi nhà, hộ khẩu, doanh nghiệp, tổ dân phố hoặc phân quyền khác",
            409,
        );
    }

    await street.deleteOne();

    await writeAuditLog({
        actorId,
        action: "street.delete",
        targetModel: "Street",
        targetId: id,
        metadata: { code: street.code, name: street.name },
    });
}
