import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import {
    getNeighborhoodById,
    listNeighborhoodHistory,
} from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.read");
        await getNeighborhoodById(params.id, user);
        return apiSuccess(await listNeighborhoodHistory(params.id));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
