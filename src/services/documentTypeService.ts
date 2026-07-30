import {
    BusinessDocument,
    BusinessType,
    DocumentType,
    type IDocumentType,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateDocumentTypeInput,
    UpdateDocumentTypeInput,
} from "@/validators/documentType";

export async function listDocumentTypes(
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
        DocumentType.find(filter)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        DocumentType.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getDocumentTypeById(id: string): Promise<IDocumentType> {
    const documentType = await DocumentType.findById(id);
    if (!documentType) {
        throw new HttpError("Khong tim thay loai giay to", 404);
    }
    return documentType;
}

export async function createDocumentType(
    actorId: string,
    input: CreateDocumentTypeInput,
) {
    const code = input.code.trim().toUpperCase();
    const existing = await DocumentType.findOne({ code });
    if (existing) {
        throw new HttpError("Ma loai giay to da ton tai", 409);
    }

    const documentType = await DocumentType.create({
        ...input,
        code,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "document_type.create",
        targetModel: "DocumentType",
        targetId: documentType._id,
        metadata: { name: documentType.name, code: documentType.code },
    });

    return documentType;
}

export async function updateDocumentType(
    actorId: string,
    id: string,
    input: UpdateDocumentTypeInput,
) {
    const documentType = await getDocumentTypeById(id);

    if (input.name !== undefined) documentType.name = input.name;
    if (input.description !== undefined) {
        documentType.description = input.description;
    }
    if (input.hasIssueDate !== undefined) {
        documentType.hasIssueDate = input.hasIssueDate;
    }
    if (input.hasExpiryDate !== undefined) {
        documentType.hasExpiryDate = input.hasExpiryDate;
    }
    if (input.active !== undefined) documentType.active = input.active;
    documentType.updatedBy = actorId as any;
    await documentType.save();

    await writeAuditLog({
        actorId,
        action: "document_type.update",
        targetModel: "DocumentType",
        targetId: documentType._id,
        metadata: { name: documentType.name, active: documentType.active },
    });

    return documentType;
}

export async function deleteDocumentType(actorId: string, id: string) {
    const documentType = await getDocumentTypeById(id);

    const referencingCount = await BusinessType.countDocuments({
        "requiredDocuments.documentTypeId": id,
    });
    if (referencingCount > 0) {
        throw new HttpError(
            "Loai giay to dang duoc mot loai hinh kinh doanh yeu cau, vui long go bo khoi dong luat truoc khi xoa",
            409,
        );
    }

    const submittedDocCount = await BusinessDocument.countDocuments({
        documentTypeId: id,
    });
    if (submittedDocCount > 0) {
        throw new HttpError(
            "Loai giay to nay da co ho kinh doanh nop, khong the xoa",
            409,
        );
    }

    await DocumentType.findByIdAndDelete(id);

    await writeAuditLog({
        actorId,
        action: "document_type.delete",
        targetModel: "DocumentType",
        targetId: id,
        metadata: { name: documentType.name, code: documentType.code },
    });

    return { _id: id };
}
