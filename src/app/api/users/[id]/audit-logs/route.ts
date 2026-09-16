import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getUserById } from "@/services/userService";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/:id/audit-logs
 * Lich su thay doi (tao/cap nhat/doi trang thai/gan-thu hoi vai tro/tai len
 * anh dai dien/tai lieu...) cua mot nguoi dung cu the - dung cho khu vuc
 * "Lich su chinh sua" trong trang chi tiet nguoi dung o admin.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.read");

        // Ap dung lai dung gioi han pham vi cua getUserById (vd to truong chi
        // xem duoc chu nha thuoc to dan pho minh) truoc khi tra lich su.
        await getUserById(actorUser, params.id);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAuditLogs({
            targetModel: "User",
            targetId: params.id,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
