import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createInfrastructureAssetSchema } from "@/validators/infrastructureAsset";
import {
    createInfrastructureAsset,
    listInfrastructureAssets,
} from "@/services/infrastructureAssetService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "infrastructure.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listInfrastructureAssets({
            actorUser,
            page,
            limit,
            neighborhoodId: searchParams.get("neighborhoodId") || undefined,
            type: searchParams.get("type") || undefined,
            condition: searchParams.get("condition") || undefined,
            search: searchParams.get("search") || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "infrastructure.manage");

        const body = createInfrastructureAssetSchema.parse(await req.json());
        const asset = await createInfrastructureAsset(actorUser, body);
        return apiSuccess(asset, "Đã tạo tài sản hạ tầng", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
