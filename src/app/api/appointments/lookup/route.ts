import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getAppointmentByCode } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/lookup?code=
 * Tra cuu lich hen theo ma - dung cho man hinh check-in (nhap tay ma lich hen,
 * xem quyet dinh da chot ve check-in thu cong trong ke hoach, chua co QR).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.checkin");
        const { searchParams } = new URL(req.url);
        const code = searchParams.get("code");
        if (!code) throw new HttpError("Thieu ma lich hen", 422);
        const appointment = await getAppointmentByCode(code);
        return apiSuccess(appointment);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
