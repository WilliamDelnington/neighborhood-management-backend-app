import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/:id/audit-logs
 * Lich su thay doi (tao/cap nhat/doi trang thai/xoa) cua mot nha so cu the -
 * dung cho khu vuc "Lich su chinh sua" trong man chi tiet nha so o admin. Chi
 * can quyen houses.read (khong phai audit.read) vi day la lich su cua rieng
 * ban ghi dang xem, khong phai nhat ky he thong.
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
        assertHouseRecordInScope(user, houseRecord);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAuditLogs({
            targetModel: "HouseRecord",
            targetId: params.id,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
