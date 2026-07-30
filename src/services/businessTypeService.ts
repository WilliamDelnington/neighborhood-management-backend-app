import { BusinessType, Business, DocumentType, type IBusinessType } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateBusinessTypeInput,
    UpdateBusinessTypeInput,
    PutDocumentRulesInput,
} from "@/validators/businessType";

export async function listBusinessTypes(
    params: {
        search?: string;
        active?: boolean;
        page?: number;
        limit?: number;
    } = {},
) {
    const filter: Record<string, unknown> = {};
    if (params.active !== undefined) filter.active = params.active;
    if (params.search) {
        filter.name = { $regex: params.search, $options: "i" };
    }
    const page = params.page || 1;
    const limit = params.limit || 20;

    const [items, total] = await Promise.all([
        BusinessType.find(filter)
            .sort({ sortOrder: 1, name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        BusinessType.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getBusinessTypeById(id: string): Promise<IBusinessType> {
    const businessType = await BusinessType.findById(id);
    if (!businessType) {
        throw new HttpError("Khong tim thay loai hinh kinh doanh", 404);
    }
    return businessType;
}

export async function createBusinessType(
    actorId: string,
    input: CreateBusinessTypeInput,
) {
    const existing = await BusinessType.findOne({ name: input.name });
    if (existing) {
        throw new HttpError("Ten loai hinh kinh doanh da ton tai", 409);
    }

    const businessType = await BusinessType.create({
        ...input,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "business_type.create",
        targetModel: "BusinessType",
        targetId: businessType._id,
        metadata: { name: businessType.name },
    });

    return businessType;
}

export async function updateBusinessType(
    actorId: string,
    id: string,
    input: UpdateBusinessTypeInput,
) {
    const businessType = await getBusinessTypeById(id);

    if (input.name !== undefined && input.name !== businessType.name) {
        const existing = await BusinessType.findOne({
            name: input.name,
            _id: { $ne: id },
        });
        if (existing) {
            throw new HttpError("Ten loai hinh kinh doanh da ton tai", 409);
        }
        businessType.name = input.name;
    }
    if (input.description !== undefined) {
        businessType.description = input.description;
    }
    if (input.active !== undefined) businessType.active = input.active;
    if (input.sortOrder !== undefined) businessType.sortOrder = input.sortOrder;
    businessType.updatedBy = actorId as any;
    await businessType.save();

    await writeAuditLog({
        actorId,
        action: "business_type.update",
        targetModel: "BusinessType",
        targetId: businessType._id,
        metadata: { name: businessType.name, active: businessType.active },
    });

    return businessType;
}

/**
 * Thay toan bo dong luat "giay to bat buoc/tuy chon" cua mot loai hinh kinh
 * doanh. Xac thuc moi documentTypeId ton tai va dang active truoc khi ghi de,
 * de tranh dong luat tro toi loai giay to da bi xoa/vo hieu hoa.
 */
export async function putDocumentRules(
    actorId: string,
    id: string,
    input: PutDocumentRulesInput,
) {
    const businessType = await getBusinessTypeById(id);

    const documentTypeIds = input.requiredDocuments.map(r => r.documentTypeId);
    if (documentTypeIds.length > 0) {
        const validCount = await DocumentType.countDocuments({
            _id: { $in: documentTypeIds },
            active: true,
        });
        if (validCount !== new Set(documentTypeIds.map(String)).size) {
            throw new HttpError(
                "Mot hoac nhieu loai giay to khong ton tai hoac da bi vo hieu hoa",
                400,
            );
        }
    }

    const previousRules = businessType.requiredDocuments;
    businessType.requiredDocuments = input.requiredDocuments as any;
    businessType.updatedBy = actorId as any;
    await businessType.save();

    await writeAuditLog({
        actorId,
        action: "business_type.update_document_rules",
        targetModel: "BusinessType",
        targetId: businessType._id,
        metadata: {
            before: previousRules,
            after: businessType.requiredDocuments,
        },
    });

    return businessType;
}

export async function deleteBusinessType(actorId: string, id: string) {
    const businessType = await getBusinessTypeById(id);

    const assignedBusinessCount = await Business.countDocuments({
        businessType: id,
    });
    if (assignedBusinessCount > 0) {
        throw new HttpError(
            "Loai hinh kinh doanh dang duoc ho kinh doanh su dung, vui long chuyen sang loai khac truoc khi xoa",
            409,
        );
    }

    await BusinessType.findByIdAndDelete(id);

    await writeAuditLog({
        actorId,
        action: "business_type.delete",
        targetModel: "BusinessType",
        targetId: id,
        metadata: { name: businessType.name },
    });

    return { _id: id };
}
