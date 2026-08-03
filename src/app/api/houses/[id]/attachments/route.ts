import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import { listAttachments } from "@/services/attachmentService";
import { toAbsoluteUploadUrl } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/:id/attachments
 * Danh sach tai lieu dinh kem cua nha so (anh/tai lieu ho tro xac thuc) - viec
 * tai len nam rieng trong /api/uploads/attachments (xem ly do trong file do).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.read");

        const houseRecord = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(user, houseRecord);

        const attachments = await listAttachments("HouseRecord", params.id);
        const origin = new URL(req.url).origin;
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
