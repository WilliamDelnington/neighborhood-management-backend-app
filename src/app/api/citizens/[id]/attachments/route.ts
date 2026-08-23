import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { Citizen, Household } from "@/models";
import { assertHouseholdInScope } from "@/services/householdService";
import { listAttachments } from "@/services/attachmentService";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/citizens/:id/attachments
 * Danh sach tai lieu dinh kem cua nhan khau - viec tai len nam rieng trong
 * /api/uploads/attachments (xem ly do trong file do).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "citizens.read");

        const citizen = await Citizen.findById(params.id);
        if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);
        const household = await Household.findById(citizen.householdId);
        if (household) await assertHouseholdInScope(user, household);

        const attachments = await listAttachments("Citizen", params.id);
        const origin = getPublicOrigin(req);
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
