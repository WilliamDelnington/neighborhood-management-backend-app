import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { Company, HouseRecord } from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/companies/:id/attachments/:fileId
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, [
            "companies.update",
            "companies.verify",
        ]);

        const company = await Company.findById(params.id);
        if (!company) throw new HttpError("Khong tim thay cong ty", 404);
        const houseRecord = await HouseRecord.findById(company.houseId);
        if (houseRecord) await assertHouseRecordInScope(user, houseRecord);

        await deleteAttachment(
            String(user._id),
            "Company",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xóa tài liệu đính kèm thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
