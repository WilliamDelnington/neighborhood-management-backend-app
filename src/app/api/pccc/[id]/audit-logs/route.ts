import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    assertPcccCheckInScope,
    getPcccCheckById,
} from "@/services/pcccService";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

/**
 * GET /api/pccc/:id/audit-logs
 * Lich su thay doi cua mot bien ban kiem tra PCCC cu the - dung cho khu vuc
 * "Lich su chinh sua" trong man chinh sua PCCC o admin.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "pccc.read");

        const check = await getPcccCheckById(params.id);
        assertPcccCheckInScope(user, check);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAuditLogs({
            targetModel: "PcccCheck",
            targetId: params.id,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
