import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    updateAppointmentService,
    archiveAppointmentService,
} from "@/services/appointmentServiceService";
import { updateAppointmentServiceSchema } from "@/validators/appointmentService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.manage");
        const body = updateAppointmentServiceSchema.parse(await req.json());
        const service = await updateAppointmentService(actorUser, params.id, body);
        return apiSuccess(service, "Cap nhat dich vu dat lich hen thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * DELETE /api/appointment-services/:id
 * Ngung hoat dong (soft-archive, active=false) - khong xoa han vi lich hen cu
 * van can tham chieu toi dich vu nay (bao cao, lich su).
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.manage");
        await archiveAppointmentService(actorUser, params.id);
        return apiSuccess(null, "Ngung hoat dong dich vu dat lich hen thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
