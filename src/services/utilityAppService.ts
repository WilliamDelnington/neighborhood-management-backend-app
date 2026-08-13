import { UtilityApp, type IUtilityApp } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateUtilityAppInput,
    UpdateUtilityAppInput,
} from "@/validators/utilityApp";

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
    const limit = params.limit || 50;

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
    if (!app) throw new HttpError("Khong tim thay tien ich", 404);
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
    if (!app) throw new HttpError("Khong tim thay tien ich", 404);

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
    if (!app) throw new HttpError("Khong tim thay tien ich", 404);
    await app.deleteOne();

    await writeAuditLog({
        actorId,
        action: "utility_app.delete",
        targetModel: "UtilityApp",
        targetId: id,
        metadata: { name: app.name },
    });
}
