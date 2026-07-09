import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole, requireUser } from "@/lib/rbac";
import {
    getDashboardSummary,
    DASHBOARD_ROLES,
} from "@/services/dashboardService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...DASHBOARD_ROLES);
        const user = await requireUser(req);

        const summary = await getDashboardSummary(user);
        return apiSuccess(summary);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
