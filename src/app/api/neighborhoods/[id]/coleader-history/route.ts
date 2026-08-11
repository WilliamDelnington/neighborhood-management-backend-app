import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getColeaderHistory, getNeighborhoodById } from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);

        const history = await getColeaderHistory(params.id);
        return apiSuccess(history);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
