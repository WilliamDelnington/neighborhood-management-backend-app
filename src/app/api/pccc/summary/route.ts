import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireRole, requireUser } from "@/lib/rbac";
import { getHouseholdRiskSummary } from "@/services/pcccService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin", "neighborhood_leader");
        const summary = await getHouseholdRiskSummary();
        return apiSuccess(summary);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
