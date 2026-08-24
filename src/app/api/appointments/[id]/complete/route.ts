import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { completeAppointment } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/:id/complete
 * Cung gate voi /check-in.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.checkin");
        const appointment = await completeAppointment(actorUser, params.id);
        return apiSuccess(appointment, "Đã hoàn thành lịch hẹn");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
