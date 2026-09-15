import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/users/:id/attachments/:fileId
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "users.update");

        await deleteAttachment(
            String(user._id),
            "User",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xóa tài liệu đính kèm thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
