import { FileAsset, type IFileAsset } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateFileAssetInput,
    UpdateFileAssetInput,
} from "@/validators/fileAsset";

// Giai doan dau chi ho tro file dang lien ket (admin dan URL cua file da duoc
// luu tru san, vd Google Drive). TODO: bo sung storage adapter (S3/GCS...) de
// ho tro upload nhi phan truc tiep trong tuong lai.

export async function createFileAsset(
    actorId: string,
    input: CreateFileAssetInput,
) {
    const fileAsset = await FileAsset.create({
        name: input.name,
        description: input.description,
        url: input.url,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        category: input.category,
        relatedModel: input.relatedModel,
        relatedId: input.relatedId,
        isPublic: input.isPublic,
        targetRoles: input.targetRoles,
        audienceAll: input.audienceAll,
        uploadedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "file_asset.create",
        targetModel: "FileAsset",
        targetId: fileAsset._id,
        metadata: { name: fileAsset.name, category: fileAsset.category },
    });

    return fileAsset;
}

export async function listFileAssets(params: {
    page: number;
    limit: number;
    category?: string;
    publicOnly?: boolean;
    // undefined/null = khong gioi han theo doi tuong (goc nhin quan tri: thay het
    // de quan ly). Mang (ke ca rong) = chi tra ve file audienceAll=true hoac co
    // it nhat 1 targetRoles trung voi role cua nguoi xem.
    viewerRoles?: string[] | null;
}) {
    const filter: Record<string, unknown> = {};
    if (params.publicOnly) filter.isPublic = true;
    if (params.category) filter.category = params.category;
    if (params.viewerRoles !== undefined && params.viewerRoles !== null) {
        filter.$or = [
            { audienceAll: true },
            { targetRoles: { $in: params.viewerRoles } },
        ];
    }

    const [items, total] = await Promise.all([
        FileAsset.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("uploadedBy", "displayName"),
        FileAsset.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getFileAssetById(
    id: string,
    publicOnly: boolean,
    viewerRoles?: string[] | null,
) {
    const fileAsset = await FileAsset.findById(id).populate(
        "uploadedBy",
        "displayName",
    );
    if (!fileAsset) throw new HttpError("Khong tim thay file", 404);
    if (publicOnly && !fileAsset.isPublic) {
        throw new HttpError("Khong tim thay file", 404);
    }
    if (viewerRoles !== undefined && viewerRoles !== null) {
        const allowed =
            fileAsset.audienceAll ||
            fileAsset.targetRoles.some(role => viewerRoles.includes(role));
        if (!allowed) throw new HttpError("Khong tim thay file", 404);
    }
    return fileAsset;
}

export async function updateFileAsset(
    actorId: string,
    id: string,
    patch: UpdateFileAssetInput,
): Promise<IFileAsset> {
    const fileAsset = await FileAsset.findById(id);
    if (!fileAsset) throw new HttpError("Khong tim thay file", 404);

    Object.assign(fileAsset, patch);
    await fileAsset.save();

    await writeAuditLog({
        actorId,
        action: "file_asset.update",
        targetModel: "FileAsset",
        targetId: fileAsset._id,
        metadata: { fields: Object.keys(patch) },
    });

    return fileAsset;
}

export async function deleteFileAsset(
    actorId: string,
    id: string,
): Promise<void> {
    const fileAsset = await FileAsset.findById(id);
    if (!fileAsset) throw new HttpError("Khong tim thay file", 404);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId,
        action: "file_asset.delete",
        targetModel: "FileAsset",
        targetId: id,
        metadata: { name: fileAsset.name },
    });
}
