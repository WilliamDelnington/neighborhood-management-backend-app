import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { Company, HouseRecord } from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { listAttachments } from "@/services/attachmentService";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/companies/:id/attachments
 * Danh sach tai lieu dinh kem cua cong ty - viec tai len nam rieng trong
 * /api/uploads/attachments (xem ly do trong file do).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "companies.read");

        const company = await Company.findById(params.id);
        if (!company) throw new HttpError("Khong tim thay cong ty", 404);
        const houseRecord = await HouseRecord.findById(company.houseId);
        if (houseRecord) await assertHouseRecordInScope(user, houseRecord);

        const attachments = await listAttachments("Company", params.id);
        const origin = getPublicOrigin(req);
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
