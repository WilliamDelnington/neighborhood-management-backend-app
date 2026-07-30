import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateNeighborhoodSchema } from "@/validators/neighborhood";
import {
    getNeighborhoodById,
    updateNeighborhood,
} from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.read");

        const neighborhood = await getNeighborhoodById(params.id, user);
        return apiSuccess(neighborhood);
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
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");

        const body = updateNeighborhoodSchema.parse(await req.json());
        const neighborhood = await updateNeighborhood(
            String(user._id),
            params.id,
            body,
        );
        return apiSuccess(neighborhood, "Cap nhat to dan pho thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
