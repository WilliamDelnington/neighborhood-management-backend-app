import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    getHouseholdById,
    assertHouseholdInScope,
} from "@/services/householdService";
import { listAttachments } from "@/services/attachmentService";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/households/:id/attachments
 * Danh sach tai lieu dinh kem cua ho dan - viec tai len nam rieng trong
 * /api/uploads/attachments (xem ly do trong file do).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "households.read");

        const household = await getHouseholdById(params.id);
        await assertHouseholdInScope(user, household);

        const attachments = await listAttachments("Household", params.id);
        const origin = getPublicOrigin(req);
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
