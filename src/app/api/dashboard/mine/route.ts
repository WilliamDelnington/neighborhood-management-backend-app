import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { getMyHouseDashboard } from "@/services/dashboardService";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/mine
 * Dashboard hanh dong (C01) cho Nha so - khac /api/reports/dashboard (danh
 * cho nhan vien/to truong, yeu cau permission rieng). Bat ky ai dang nhap
 * cung xem duoc, chi tra ve so lieu cua CHINH minh.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        const summary = await getMyHouseDashboard(user);
        return apiSuccess(summary);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
