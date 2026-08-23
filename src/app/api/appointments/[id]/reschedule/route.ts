import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { rescheduleAppointment } from "@/services/appointmentService";
import { rescheduleAppointmentSchema } from "@/validators/appointment";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/:id/reschedule
 * Khong gate boi mot permission co dinh o day - rescheduleAppointment tu kiem
 * tra actor la chu lich hen (citizenUserId/bookedByUserId) va lich hen dang o
 * trang thai "da_xac_nhan".
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = rescheduleAppointmentSchema.parse(await req.json());
        const appointment = await rescheduleAppointment(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(appointment, "Da doi lich hen");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
