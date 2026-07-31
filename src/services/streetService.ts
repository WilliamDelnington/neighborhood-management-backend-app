import { Street, type IStreet } from "@/models";
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
    if (!street) throw new HttpError("Khong tim thay duong/pho", 404);
    return street;
}

export async function createStreet(
    actorId: string,
    input: CreateStreetInput,
): Promise<IStreet> {
    const existing = await Street.findOne({ code: input.code });
    if (existing) {
        throw new HttpError("Ma duong/pho da ton tai", 409);
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
    if (!street) throw new HttpError("Khong tim thay duong/pho", 404);

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
