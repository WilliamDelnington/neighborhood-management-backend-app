import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getLeaderHistory } from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");

        const history = await getLeaderHistory(params.id);
        return apiSuccess(history);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
