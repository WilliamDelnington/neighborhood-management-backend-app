import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireRole, requireUser } from "@/lib/rbac";
import {
    getDashboardSummary,
    DASHBOARD_ROLES,
} from "@/services/dashboardService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, ...DASHBOARD_ROLES);

        const summary = await getDashboardSummary(user);
        return apiSuccess(summary);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
