import {
    Business,
    HouseRecord,
    BusinessType,
    type IBusiness,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import type {
    CreateBusinessInput,
    UpdateBusinessInput,
} from "@/validators/business";

/**
 * Nem HttpError(404) neu businessType duoc chon khong ton tai - tranh ho
 * kinh doanh tro toi mot loai hinh da bi xoa hoac chua bao gio ton tai.
 */
async function assertBusinessTypeExists(businessType?: string | null): Promise<void> {
    if (!businessType) return;
    const exists = await BusinessType.exists({ _id: businessType });
    if (!exists) {
        throw new HttpError("Khong tim thay loai hinh kinh doanh", 404);
    }
}

export async function createBusiness(
    actorUser: IUser,
    input: CreateBusinessInput,
): Promise<IBusiness> {
    const houseRecord = await HouseRecord.findById(input.houseId);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
    assertHouseRecordInScope(actorUser, houseRecord);
    await assertBusinessTypeExists(input.businessType);

    const business = await Business.create({
        name: input.name,
        houseId: input.houseId,
        cluster: houseRecord.cluster,
        businessType: input.businessType || undefined,
        ownerName: input.ownerName,
        phone: input.phone,
        active: input.active ?? true,
        note: input.note,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business.create",
        targetModel: "Business",
        targetId: business._id,
        metadata: { name: business.name, houseId: input.houseId },
    });

    return business;
}

export async function listBusinesses(params: {
    houseId: string;
    page?: number;
    limit?: number;
}) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const filter = { houseId: params.houseId };

    const [items, total] = await Promise.all([
        Business.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("businessType", "name"),
        Business.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getBusinessById(id: string): Promise<IBusiness> {
    const business = await Business.findById(id).populate(
        "businessType",
        "name",
    );
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);
    return business;
}

export async function updateBusiness(
    actorUser: IUser,
    id: string,
    patch: UpdateBusinessInput,
): Promise<IBusiness> {
    const business = await Business.findById(id);
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);

    const houseRecord = await HouseRecord.findById(business.houseId);
    if (houseRecord) assertHouseRecordInScope(actorUser, houseRecord);

    if (patch.businessType) {
        await assertBusinessTypeExists(patch.businessType);
    }

    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (business as unknown as Record<string, unknown>)[key] = value;
        }
    }
    business.updatedBy = actorUser._id as any;
    await business.save();
    await business.populate("businessType", "name");

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business.update",
        targetModel: "Business",
        targetId: business._id,
        metadata: patch,
    });

    return business;
}

export async function deleteBusiness(
    actorId: string,
    id: string,
): Promise<IBusiness> {
    const business = await Business.findById(id);
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);

    await business.deleteOne();

    await writeAuditLog({
        actorId,
        action: "business.delete",
        targetModel: "Business",
        targetId: id,
        metadata: { name: business.name },
    });

    return business;
}
