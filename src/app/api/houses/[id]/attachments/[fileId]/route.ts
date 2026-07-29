import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/houses/:id/attachments/:fileId
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, ["houses.update", "houses.verify"]);

        const houseRecord = await getHouseRecordById(params.id);
        assertHouseRecordInScope(user, houseRecord);

        await deleteAttachment(
            String(user._id),
            "HouseRecord",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xoa tai lieu dinh kem thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
