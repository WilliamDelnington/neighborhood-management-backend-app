import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { confirmAppointment } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/:id/confirm
 * Chi co y nghia khi dich vu autoApprove=false - can bo duoc phan cong dich vu
 * nay (hoac admin) duyet mot lich hen dang "cho_xac_nhan".
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.checkin");
        const appointment = await confirmAppointment(actorUser, params.id);
        return apiSuccess(appointment, "Đã xác nhận lịch hẹn");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
