import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { Business, HouseRecord } from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/businesses/:id/attachments/:fileId
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, [
            "businesses.update",
            "businesses.verify",
        ]);

        const business = await Business.findById(params.id);
        if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);
        const houseRecord = await HouseRecord.findById(business.houseId);
        if (houseRecord) assertHouseRecordInScope(user, houseRecord);

        await deleteAttachment(
            String(user._id),
            "Business",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xoa tai lieu dinh kem thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
