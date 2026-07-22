import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { getHouseRiskSummary } from "@/services/pcccService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "pccc.read");
        const summary = await getHouseRiskSummary();
        return apiSuccess(summary);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
