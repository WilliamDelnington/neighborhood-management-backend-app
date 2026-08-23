import { UtilityApp, type IUtilityApp } from "@/models";
import { HttpError } from "@/lib/response";
import { getPublicOrigin, saveUploadedFile, toAbsoluteUploadUrl } from "@/lib/localUpload";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateUtilityAppInput,
    UpdateUtilityAppInput,
} from "@/validators/utilityApp";

const MAX_ICON_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_ICON_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];

export async function uploadUtilityAppIcon(
    actorId: string,
    file: File,
    req: Request,
): Promise<{ url: string }> {
    if (file.size > MAX_ICON_SIZE_BYTES) {
        throw new HttpError("Ảnh vượt quá dung lượng cho phép (tối đa 5MB)", 400);
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_ICON_EXTENSIONS.includes(ext)) {
        throw new HttpError(
            `Định dạng ảnh không được hỗ trợ (chỉ chấp nhận ${ALLOWED_ICON_EXTENSIONS.join(", ")})`,
            400,
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(buffer, file.name, "utility-apps/icons");

    await writeAuditLog({
        actorId,
        action: "utility_app.icon.upload",
        targetModel: "UtilityApp",
        metadata: { name: file.name },
    });

    return { url: toAbsoluteUploadUrl(url, getPublicOrigin(req)) };
}

export async function listUtilityApps(
    params: {
        activeOnly?: boolean;
        page?: number;
        limit?: number;
    } = {},
) {
    const filter: Record<string, unknown> = {};
    if (params.activeOnly) filter.active = true;
    const page = params.page || 1;
    const limit = params.limit || 10;

    const [items, total] = await Promise.all([
        UtilityApp.find(filter)
            .sort({ sortOrder: 1, name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        UtilityApp.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getUtilityAppById(id: string): Promise<IUtilityApp> {
    const app = await UtilityApp.findById(id);
    if (!app) throw new HttpError("Không tìm thấy tiện ích", 404);
    return app;
}

export async function createUtilityApp(
    actorId: string,
    input: CreateUtilityAppInput,
): Promise<IUtilityApp> {
    const app = await UtilityApp.create({
        ...input,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "utility_app.create",
        targetModel: "UtilityApp",
        targetId: app._id,
        metadata: { name: app.name },
    });

    return app;
}

export async function updateUtilityApp(
    actorId: string,
    id: string,
    input: UpdateUtilityAppInput,
): Promise<IUtilityApp> {
    const app = await UtilityApp.findById(id);
    if (!app) throw new HttpError("Không tìm thấy tiện ích", 404);

    Object.assign(app, input);
    app.updatedBy = actorId as any;
    await app.save();

    await writeAuditLog({
        actorId,
        action: "utility_app.update",
        targetModel: "UtilityApp",
        targetId: app._id,
        metadata: { patch: input },
    });

    return app;
}

export async function deleteUtilityApp(
    actorId: string,
    id: string,
): Promise<void> {
    const app = await UtilityApp.findById(id);
    if (!app) throw new HttpError("Không tìm thấy tiện ích", 404);
    await app.deleteOne();

    await writeAuditLog({
        actorId,
        action: "utility_app.delete",
        targetModel: "UtilityApp",
        targetId: id,
        metadata: { name: app.name },
    });
}
