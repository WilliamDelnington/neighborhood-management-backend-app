import { InfrastructureAsset, type IInfrastructureAsset, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { neighborhoodScopeFilter } from "@/lib/rbac";
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
    if (!asset) throw new HttpError("Khong tim thay tai san ha tang", 404);
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
                "Ban khong co quyen thao tac voi tai san ngoai to dan pho duoc phan cong",
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
                "Ban khong co quyen tao tai san ngoai to dan pho duoc phan cong",
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
