import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import {
    getHouseholdById,
    assertHouseholdInScope,
} from "@/services/householdService";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/households/:id/attachments/:fileId
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, [
            "households.update",
            "households.verify",
        ]);

        const household = await getHouseholdById(params.id);
        await assertHouseholdInScope(user, household);

        await deleteAttachment(
            String(user._id),
            "Household",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xóa tài liệu đính kèm thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
