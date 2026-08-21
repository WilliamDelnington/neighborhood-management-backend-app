import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateInfrastructureAssetSchema } from "@/validators/infrastructureAsset";
import {
    deleteInfrastructureAsset,
    getInfrastructureAssetById,
    updateInfrastructureAsset,
} from "@/services/infrastructureAssetService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "infrastructure.read");

        const asset = await getInfrastructureAssetById(actorUser, params.id);
        return apiSuccess(asset);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "infrastructure.manage");

        const body = updateInfrastructureAssetSchema.parse(await req.json());
        const asset = await updateInfrastructureAsset(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(asset, "Đã cập nhật tài sản hạ tầng");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "infrastructure.manage");

        await deleteInfrastructureAsset(actorUser, params.id);
        return apiSuccess(null, "Đã xóa tài sản hạ tầng");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
