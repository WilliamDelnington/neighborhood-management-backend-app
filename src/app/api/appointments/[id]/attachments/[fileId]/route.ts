import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { Appointment, FileAsset } from "@/models";
import { assertAppointmentAttachmentAccess } from "@/services/appointmentService";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/appointments/:id/attachments/:fileId
 * Mirror /api/complaints/:id/attachments/:fileId. :id co the la mot lich hen
 * da ton tai, hoac mot draftId chua ung voi ban ghi nao (dang xoa bot mot tai
 * lieu vua dinh kem tren form dat lich, truoc khi gui) - truong hop nay khong
 * co Appointment de kiem tra chu so huu, nen xet truc tiep FileAsset.uploadedBy.
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const appointment = await Appointment.findById(params.id);
        if (appointment) {
            await assertAppointmentAttachmentAccess(actorUser, appointment);
        } else {
            const fileAsset = await FileAsset.findOne({
                _id: params.fileId,
                relatedModel: "Appointment",
                relatedId: params.id,
            });
            if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);
            if (
                String(fileAsset.uploadedBy) !== String(actorUser._id) &&
                !actorUser.roles.includes("admin")
            ) {
                throw new HttpError(
                    "Chỉ người đặt lịch mới được xóa tài liệu đính kèm",
                    403,
                );
            }
        }

        await deleteAttachment(
            String(actorUser._id),
            "Appointment",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xoa tai lieu dinh kem thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
