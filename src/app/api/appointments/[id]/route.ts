import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, userHasPermission } from "@/lib/rbac";
import { getAppointmentDetailForRequester } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/:id
 * Chu lich hen (nguoi dat/citizenUserId) luon xem duoc; nhan vien can
 * appointments.read va trong pham vi phu trach (xem
 * getAppointmentDetailForRequester/assertAppointmentInScope).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const isStaff = await userHasPermission(actorUser, "appointments.read");
        const appointment = await getAppointmentDetailForRequester(params.id, {
            userId: String(actorUser._id),
            isStaff,
            actorUser: isStaff ? actorUser : undefined,
        });
        return apiSuccess(appointment);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
