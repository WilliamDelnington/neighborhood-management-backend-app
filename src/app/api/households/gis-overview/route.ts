import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getHouseholdGisOverview } from "@/services/householdService";

export const dynamic = "force-dynamic";

/**
 * GET /api/households/gis-overview
 * Endpoint rieng, CHI duoc goi khi nhan vien bam nut "Xem ban do" o widget
 * "Bản đồ trạng thái Hộ dân" tren Dashboard (khong tu dong tai khi vao trang
 * danh sach ho dan). Chi can households.read (xem, khong can quyen sua).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "households.read");
        const overview = await getHouseholdGisOverview(actorUser);
        return apiSuccess(overview);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
