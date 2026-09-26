import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser, userHasPermission } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getEmergencyComplaintGisOverview } from "@/services/complaintService";

export const dynamic = "force-dynamic";

/**
 * GET /api/complaints/emergency-gis
 * Phuc vu marker "khan cap" nhap nhay tren trang Ban do (NeighborhoodZonesMap.tsx) -
 * chi phan anh thuoc danh muc isUrgent, dang o 1 trong 3 trang thai con xu ly
 * VA da co toa do GPS. Chi can complaints.read (xem, khong can quyen sua).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.read");
        const canReadEscalated = await userHasPermission(
            actorUser,
            "complaints.read_escalated",
        );
        const overview = await getEmergencyComplaintGisOverview(
            actorUser,
            canReadEscalated,
        );
        return apiSuccess(overview);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
