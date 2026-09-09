import {
    BusinessDocument,
    BusinessType,
    DocumentType,
    type IDocumentType,
} from "@/models";
import { HttpError } from "@/lib/response";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateDocumentTypeInput,
    UpdateDocumentTypeInput,
} from "@/validators/documentType";

const MAX_SAMPLE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_SAMPLE_FILE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf",
    ".doc",
    ".docx",
];

async function saveSampleFile(
    file: File,
): Promise<{ url: string; name: string }> {
    if (file.size > MAX_SAMPLE_FILE_SIZE_BYTES) {
        throw new HttpError(
            "File mẫu vượt quá dung lượng cho phép (tối đa 10MB)",
            400,
        );
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_SAMPLE_FILE_EXTENSIONS.includes(ext)) {
        throw new HttpError(
            `Định dạng file không được hỗ trợ (chỉ chấp nhận ${ALLOWED_SAMPLE_FILE_EXTENSIONS.join(", ")})`,
            400,
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(buffer, file.name, "document-types");
    return { url, name: file.name };
}

export async function listDocumentTypes(
    params: {
        search?: string;
        active?: boolean;
        hasIssueDate?: boolean;
        hasExpiryDate?: boolean;
        page?: number;
        limit?: number;
    } = {},
) {
    const filter: Record<string, unknown> = {};
    if (params.active !== undefined) filter.active = params.active;
    if (params.hasIssueDate !== undefined) {
        filter.hasIssueDate = params.hasIssueDate;
    }
    if (params.hasExpiryDate !== undefined) {
        filter.hasExpiryDate = params.hasExpiryDate;
    }
    if (params.search) {
        filter.name = { $regex: params.search, $options: "i" };
    }
    const page = params.page || 1;
    const limit = params.limit || 10;

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
        throw new HttpError("Không tìm thấy loại giấy tờ", 404);
    }
    return documentType;
}

export async function createDocumentType(
    actorId: string,
    input: CreateDocumentTypeInput,
    sampleFile?: File,
) {
    const code = input.code.trim().toUpperCase();
    const existing = await DocumentType.findOne({ code });
    if (existing) {
        throw new HttpError("Mã loại giấy tờ đã tồn tại", 409);
    }

    const sample = sampleFile ? await saveSampleFile(sampleFile) : undefined;

    const documentType = await DocumentType.create({
        ...input,
        code,
        sampleFileUrl: sample?.url,
        sampleFileName: sample?.name,
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
    options: { sampleFile?: File; removeSampleFile?: boolean } = {},
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

    if (options.sampleFile) {
        const sample = await saveSampleFile(options.sampleFile);
        if (documentType.sampleFileUrl) {
            await deleteUploadedFile(documentType.sampleFileUrl);
        }
        documentType.sampleFileUrl = sample.url;
        documentType.sampleFileName = sample.name;
    } else if (options.removeSampleFile && documentType.sampleFileUrl) {
        await deleteUploadedFile(documentType.sampleFileUrl);
        documentType.sampleFileUrl = undefined;
        documentType.sampleFileName = undefined;
    }

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
            "Loại giấy tờ đang được một loại hình kinh doanh yêu cầu, vui lòng gỡ bỏ khỏi dòng luật trước khi xóa",
            409,
        );
    }

    const submittedDocCount = await BusinessDocument.countDocuments({
        documentTypeId: id,
    });
    if (submittedDocCount > 0) {
        throw new HttpError(
            "Loại giấy tờ này đã có hộ kinh doanh nộp, không thể xóa",
            409,
        );
    }

    await DocumentType.findByIdAndDelete(id);
    if (documentType.sampleFileUrl) {
        await deleteUploadedFile(documentType.sampleFileUrl);
    }

    await writeAuditLog({
        actorId,
        action: "document_type.delete",
        targetModel: "DocumentType",
        targetId: id,
        metadata: { name: documentType.name, code: documentType.code },
    });

    return { _id: id };
}
