import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { Appointment } from "@/models";
import { assertAppointmentAttachmentAccess } from "@/services/appointmentService";
import { listAttachments } from "@/services/attachmentService";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/:id/attachments
 * Mirror /api/complaints/:id/attachments - chu lich hen (citizenUserId/
 * bookedByUserId), can bo duoc phan cong dich vu, hoac admin moi duoc xem
 * (xem assertAppointmentAttachmentAccess). Viec tai len nam rieng trong
 * /api/uploads/attachments.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const appointment = await Appointment.findById(params.id);
        if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);
        await assertAppointmentAttachmentAccess(actorUser, appointment);

        const attachments = await listAttachments("Appointment", params.id);
        const origin = getPublicOrigin(req);
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
