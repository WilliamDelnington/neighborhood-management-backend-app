import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { bulkUpdateHouseRecordStatusSchema } from "@/validators/houseRecord";
import { bulkTransitionHouseRecordStatus } from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/houses/bulk-status
 * Duyet/tu choi/yeu cau cap nhat hang loat (vd duyet nhanh cac nha dang "Chờ
 * duyệt"), chon tu man "Danh sach nha so". Loc quyen tho giong PATCH
 * /api/houses/:id/status - kiem tra chi tiet (chu nha vs nhan vien duyet vs
 * admin, dung trang thai nguon...) nam trong transitionHouseRecordStatus,
 * ap dung rieng cho tung nha (xem bulkTransitionHouseRecordStatus).
 */
export async function PATCH(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, ["houses.update", "houses.verify"]);

        const body = bulkUpdateHouseRecordStatusSchema.parse(await req.json());
        const result = await bulkTransitionHouseRecordStatus(
            user,
            body.ids,
            body.status,
            body.note,
        );
        return apiSuccess(
            result,
            `Đã cập nhật trạng thái cho ${result.succeededIds.length}/${body.ids.length} nhà số`,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
