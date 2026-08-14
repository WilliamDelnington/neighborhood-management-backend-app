import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { checkInAppointment } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/:id/check-in
 * Can bo duoc phan cong dich vu nay (AppointmentService.assignedOfficerUserIds)
 * hoac admin - kiem tra appointments.checkin (dieu kien can) roi kiem tra
 * phan cong theo dich vu (dieu kien du, xem assertOfficerForService).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.checkin");
        const appointment = await checkInAppointment(actorUser, params.id);
        return apiSuccess(appointment, "Da check-in lich hen");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
