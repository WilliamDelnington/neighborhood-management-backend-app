import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    updateAppointmentHoliday,
    deleteAppointmentHoliday,
} from "@/services/appointmentHolidayService";
import { updateAppointmentHolidaySchema } from "@/validators/appointmentHoliday";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.manage");
        const body = updateAppointmentHolidaySchema.parse(await req.json());
        const holiday = await updateAppointmentHoliday(actorUser, params.id, body);
        return apiSuccess(holiday, "Da cap nhat ngay nghi/le");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.manage");
        await deleteAppointmentHoliday(actorUser, params.id);
        return apiSuccess(null, "Da xoa ngay nghi/le");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
