import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { getDashboardSummary } from "@/services/dashboardService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "dashboard.read");

        const summary = await getDashboardSummary(user);
        return apiSuccess(summary);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
