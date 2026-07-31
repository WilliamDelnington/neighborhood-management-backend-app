import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { Business, HouseRecord } from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { listAttachments } from "@/services/attachmentService";
import { toAbsoluteUploadUrl } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/businesses/:id/attachments
 * Danh sach tai lieu dinh kem cua ho kinh doanh - viec tai len nam rieng
 * trong /api/uploads/attachments (xem ly do trong file do).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "businesses.read");

        const business = await Business.findById(params.id);
        if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);
        const houseRecord = await HouseRecord.findById(business.houseId);
        if (houseRecord) assertHouseRecordInScope(user, houseRecord);

        const attachments = await listAttachments("Business", params.id);
        const origin = new URL(req.url).origin;
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
