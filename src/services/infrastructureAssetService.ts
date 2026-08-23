import {
    FileAsset,
    InfrastructureAsset,
    type IInfrastructureAsset,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { neighborhoodScopeFilter } from "@/lib/rbac";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/localUpload";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateInfrastructureAssetInput,
    UpdateInfrastructureAssetInput,
} from "@/validators/infrastructureAsset";

/**
 * InfrastructureAsset chi co neighborhoodId (khong co truong cluster nhu
 * House/Household/Complaint), nen KHONG dung areaScopeFilter chung (nhanh
 * cluster cua ham do se luon rong vi model khong co truong "cluster" - loc
 * nham thanh "khong thay gi" cho secretary/PCO). To truong/To pho van gioi
 * han theo to dan pho duoc gan (neighborhoodScopeFilter); cac vai tro khac co
 * infrastructure.read (admin/secretary/PCO) xem khong gioi han - giong quy
 * uoc "nhan vien chua duoc gan cum = xem toan phuong" o cac module khac.
 */
function scopeFilter(user: IUser): Record<string, unknown> {
    if (
        user.roles.includes("neighborhood_leader") ||
        user.roles.includes("neighborhood_coleader")
    ) {
        return neighborhoodScopeFilter(user);
    }
    return {};
}

export async function listInfrastructureAssets(params: {
    actorUser: IUser;
    page: number;
    limit: number;
    neighborhoodId?: string;
    type?: string;
    condition?: string;
    search?: string;
}) {
    const filter: Record<string, unknown> = { ...scopeFilter(params.actorUser) };
    if (params.neighborhoodId) filter.neighborhoodId = params.neighborhoodId;
    if (params.type) filter.type = params.type;
    if (params.condition) filter.condition = params.condition;
    if (params.search) {
        filter.name = { $regex: params.search, $options: "i" };
    }

    const [items, total] = await Promise.all([
        InfrastructureAsset.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("neighborhoodId", "code name"),
        InfrastructureAsset.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

async function findInScope(
    actorUser: IUser,
    id: string,
): Promise<IInfrastructureAsset> {
    const asset = await InfrastructureAsset.findById(id);
    if (!asset) throw new HttpError("Không tìm thấy tài sản hạ tầng", 404);
    if (
        actorUser.roles.includes("neighborhood_leader") ||
        actorUser.roles.includes("neighborhood_coleader")
    ) {
        const ids = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ]
            .filter(Boolean)
            .map(String);
        if (!ids.includes(String(asset.neighborhoodId))) {
            throw new HttpError(
                "Bạn không có quyền thao tác với tài sản ngoài tổ dân phố được phân công",
                403,
            );
        }
    }
    return asset;
}

export async function getInfrastructureAssetById(
    actorUser: IUser,
    id: string,
): Promise<IInfrastructureAsset> {
    const asset = await findInScope(actorUser, id);
    await asset.populate("neighborhoodId", "code name");
    return asset;
}

export async function createInfrastructureAsset(
    actorUser: IUser,
    input: CreateInfrastructureAssetInput,
): Promise<IInfrastructureAsset> {
    if (
        (actorUser.roles.includes("neighborhood_leader") ||
            actorUser.roles.includes("neighborhood_coleader")) &&
        !actorUser.roles.includes("admin")
    ) {
        const ids = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ]
            .filter(Boolean)
            .map(String);
        if (!ids.includes(input.neighborhoodId)) {
            throw new HttpError(
                "Bạn không có quyền tạo tài sản ngoài tổ dân phố được phân công",
                403,
            );
        }
    }

    const asset = await InfrastructureAsset.create({
        ...input,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "infrastructure_asset.create",
        targetModel: "InfrastructureAsset",
        targetId: asset._id,
        metadata: { name: asset.name, type: asset.type },
    });

    return asset;
}

export async function updateInfrastructureAsset(
    actorUser: IUser,
    id: string,
    patch: UpdateInfrastructureAssetInput,
): Promise<IInfrastructureAsset> {
    const asset = await findInScope(actorUser, id);

    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (asset as unknown as Record<string, unknown>)[key] = value;
        }
    }
    asset.updatedBy = actorUser._id as any;
    await asset.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "infrastructure_asset.update",
        targetModel: "InfrastructureAsset",
        targetId: asset._id,
        metadata: patch,
    });

    return asset;
}

export async function deleteInfrastructureAsset(
    actorUser: IUser,
    id: string,
): Promise<void> {
    const asset = await findInScope(actorUser, id);
    await InfrastructureAsset.findByIdAndDelete(asset._id);

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "infrastructure_asset.delete",
        targetModel: "InfrastructureAsset",
        targetId: asset._id,
        metadata: { name: asset.name },
    });
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf",
    ".doc",
    ".docx",
];

export async function listInfrastructureAssetAttachments(
    actorUser: IUser,
    assetId: string,
) {
    await findInScope(actorUser, assetId);

    return FileAsset.find({
        relatedModel: "InfrastructureAsset",
        relatedId: assetId,
    })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

export async function uploadInfrastructureAssetAttachment(
    actorUser: IUser,
    assetId: string,
    file: File,
) {
    await findInScope(actorUser, assetId);

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new HttpError(
            "File vượt quá dung lượng cho phép (tối đa 10MB)",
            400,
        );
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        throw new HttpError(
            `Định dạng file không được hỗ trợ (chỉ chấp nhận ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")})`,
            400,
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(
        buffer,
        file.name,
        `infrastructure-assets/${assetId}`,
    );

    const fileAsset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "InfrastructureAsset",
        relatedId: assetId,
        isPublic: false,
        audienceAll: false,
        targetRoles: [],
        uploadedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "infrastructure_asset.attachment.upload",
        targetModel: "InfrastructureAsset",
        targetId: assetId,
        metadata: { fileAssetId: fileAsset._id, name: file.name },
    });

    return fileAsset;
}

export async function deleteInfrastructureAssetAttachment(
    actorUser: IUser,
    assetId: string,
    fileAssetId: string,
): Promise<void> {
    await findInScope(actorUser, assetId);

    const fileAsset = await FileAsset.findOne({
        _id: fileAssetId,
        relatedModel: "InfrastructureAsset",
        relatedId: assetId,
    });
    if (!fileAsset) throw new HttpError("Không tìm thấy file", 404);

    await deleteUploadedFile(fileAsset.url);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "infrastructure_asset.attachment.delete",
        targetModel: "InfrastructureAsset",
        targetId: assetId,
        metadata: { fileAssetId, name: fileAsset.name },
    });
}
