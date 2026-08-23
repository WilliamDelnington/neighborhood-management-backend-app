import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { rejectAppointment } from "@/services/appointmentService";
import { rejectAppointmentSchema } from "@/validators/appointment";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/:id/reject
 * Cung gate voi /confirm - can bo duoc phan cong dich vu (hoac admin) tu choi
 * mot lich hen dang "cho_xac_nhan".
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.checkin");
        const body = rejectAppointmentSchema.parse(await req.json());
        const appointment = await rejectAppointment(actorUser, params.id, body.reason);
        return apiSuccess(appointment, "Đã từ chối lịch hẹn");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
