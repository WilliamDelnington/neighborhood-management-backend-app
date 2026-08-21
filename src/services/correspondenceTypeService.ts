import { Correspondence, CorrespondenceType, type ICorrespondenceType } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateCorrespondenceTypeInput,
    UpdateCorrespondenceTypeInput,
} from "@/validators/correspondenceType";

export async function listCorrespondenceTypes(
    params: {
        search?: string;
        active?: boolean;
        eligibleSenderRoles?: string[];
        page?: number;
        limit?: number;
    } = {},
) {
    const filter: Record<string, unknown> = {};
    if (params.active !== undefined) filter.active = params.active;
    if (params.eligibleSenderRoles && params.eligibleSenderRoles.length > 0) {
        filter.allowedSenderRoles = { $in: params.eligibleSenderRoles };
    }
    if (params.search) {
        filter.name = { $regex: params.search, $options: "i" };
    }
    const page = params.page || 1;
    const limit = params.limit || 10;

    const [items, total] = await Promise.all([
        CorrespondenceType.find(filter)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        CorrespondenceType.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getCorrespondenceTypeById(
    id: string,
): Promise<ICorrespondenceType> {
    const type = await CorrespondenceType.findById(id);
    if (!type) throw new HttpError("Không tìm thấy loại văn bản", 404);
    return type;
}

export async function createCorrespondenceType(
    actorId: string,
    input: CreateCorrespondenceTypeInput,
) {
    const code = input.code.trim().toUpperCase();
    const existing = await CorrespondenceType.findOne({ code });
    if (existing) throw new HttpError("Mã loại văn bản đã tồn tại", 409);

    const type = await CorrespondenceType.create({
        ...input,
        code,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "correspondence_type.create",
        targetModel: "CorrespondenceType",
        targetId: type._id,
        metadata: { name: type.name, code: type.code },
    });

    return type;
}

export async function updateCorrespondenceType(
    actorId: string,
    id: string,
    input: UpdateCorrespondenceTypeInput,
) {
    const type = await getCorrespondenceTypeById(id);

    if (input.name !== undefined) type.name = input.name;
    if (input.description !== undefined) type.description = input.description;
    if (input.allowedSenderRoles !== undefined)
        type.allowedSenderRoles = input.allowedSenderRoles;
    if (input.allowedReceiverRoles !== undefined)
        type.allowedReceiverRoles = input.allowedReceiverRoles;
    if (input.requireDocumentNumber !== undefined)
        type.requireDocumentNumber = input.requireDocumentNumber;
    if (input.active !== undefined) type.active = input.active;
    type.updatedBy = actorId as any;
    await type.save();

    await writeAuditLog({
        actorId,
        action: "correspondence_type.update",
        targetModel: "CorrespondenceType",
        targetId: type._id,
        metadata: { name: type.name, active: type.active },
    });

    return type;
}

export async function deleteCorrespondenceType(actorId: string, id: string) {
    const type = await getCorrespondenceTypeById(id);

    const usedCount = await Correspondence.countDocuments({
        correspondenceTypeId: id,
    });
    if (usedCount > 0) {
        throw new HttpError(
            "Loại văn bản này đã có văn bản được tạo, không thể xóa",
            409,
        );
    }

    await CorrespondenceType.findByIdAndDelete(id);

    await writeAuditLog({
        actorId,
        action: "correspondence_type.delete",
        targetModel: "CorrespondenceType",
        targetId: id,
        metadata: { name: type.name, code: type.code },
    });

    return { _id: id };
}
