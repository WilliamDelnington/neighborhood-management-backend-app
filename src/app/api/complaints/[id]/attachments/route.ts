import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import {
    requireUser,
    userHasPermission,
    getUserAllowedComplaintCategories,
} from "@/lib/rbac";
import { Complaint } from "@/models";
import { assertComplaintReadable } from "@/services/complaintService";
import { listAttachments } from "@/services/attachmentService";
import { toAbsoluteUploadUrl } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/complaints/:id/attachments
 * Danh sach tai lieu dinh kem cua phan anh (anh/tai lieu minh chung) - chu
 * phan anh hoac nhan vien trong pham vi phu trach moi duoc xem (giong het
 * quyen xem chi tiet phan anh, xem assertComplaintReadable). Viec tai len nam
 * rieng trong /api/uploads/attachments (xem ly do trong file do).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const complaint = await Complaint.findById(params.id);
        if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

        const isStaff = await userHasPermission(actorUser, "complaints.read");
        const allowedCategories = isStaff
            ? await getUserAllowedComplaintCategories(actorUser)
            : null;
        const canReadEscalated = isStaff
            ? await userHasPermission(actorUser, "complaints.read_escalated")
            : false;
        assertComplaintReadable(complaint, {
            userId: String(actorUser._id),
            isStaff,
            allowedCategories,
            actorUser: isStaff ? actorUser : undefined,
            canReadEscalated,
        });

        const attachments = await listAttachments("Complaint", params.id);
        const origin = new URL(req.url).origin;
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
