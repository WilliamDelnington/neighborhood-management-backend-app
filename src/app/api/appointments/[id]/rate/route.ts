import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { rateAppointment } from "@/services/appointmentService";
import { rateAppointmentSchema } from "@/validators/appointment";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/:id/rate
 * Khong gate boi permission co dinh - rateAppointment tu kiem tra actor la
 * chu lich hen (citizenUserId/bookedByUserId), chi mot lan, chi tu "hoan_thanh".
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = rateAppointmentSchema.parse(await req.json());
        const appointment = await rateAppointment(actorUser, params.id, body);
        return apiSuccess(appointment, "Da gui danh gia lich hen");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
