import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { bulkDeleteHouseRecordSchema } from "@/validators/houseRecord";
import { bulkDeleteHouseRecords } from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/houses/bulk-delete
 * Xoa hang loat nha so duoc chon tu man "Danh sach nha so". Loc quyen giong
 * DELETE /api/houses/:id - kiem tra chi tiet (pham vi actor, con ho dan/ho
 * kinh doanh lien ket...) nam trong bulkDeleteHouseRecords, ap dung rieng cho
 * tung nha.
 */
export async function DELETE(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.delete");

        const body = bulkDeleteHouseRecordSchema.parse(await req.json());
        const result = await bulkDeleteHouseRecords(user, body.ids);
        return apiSuccess(
            result,
            `Đã xóa ${result.succeededIds.length}/${body.ids.length} nhà số`,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
