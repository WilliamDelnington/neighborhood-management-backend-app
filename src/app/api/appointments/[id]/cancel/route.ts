import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { cancelAppointment } from "@/services/appointmentService";
import { cancelAppointmentSchema } from "@/validators/appointment";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/:id/cancel
 * Khong gate boi mot permission co dinh o day - cancelAppointment tu kiem tra
 * actor la chu lich hen (BR-03: chi huy duoc truoc gio hen >=2 tieng) HOAC can
 * bo duoc phan cong dich vu/admin (huy bat ky luc nao).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        let raw: unknown = {};
        try {
            raw = await req.json();
        } catch {
            raw = {};
        }
        const body = cancelAppointmentSchema.parse(raw);
        const appointment = await cancelAppointment(actorUser, params.id, body.reason);
        return apiSuccess(appointment, "Da huy lich hen");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
