import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getHouseGisOverview } from "@/services/dashboardService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/gis-overview
 * Endpoint rieng, CHI duoc goi khi nhan vien bam nut "Xem ban do" o admin-web-app
 * (khong tu dong tai khi vao trang danh sach nha so) - tach khoi
 * getDashboardSummary de khong phai tai toan bo dashboard chi de xem ban do.
 * Chi can houses.read (xem, khong can quyen sua GIS).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "houses.read");
        const overview = await getHouseGisOverview(actorUser);
        return apiSuccess(overview);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
