import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/auth/me/attachments/:fileId
 * Xoa tai lieu dinh kem cua CHINH nguoi dang dang nhap.
 */
export async function DELETE(
    req: Request,
    { params }: { params: { fileId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const actorId = String(actorUser._id);

        await deleteAttachment(actorId, "User", actorId, params.fileId);
        return apiSuccess(null, "Xóa tài liệu đính kèm thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
