import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    assertSecurityRecordInScope,
    getSecurityRecordById,
} from "@/services/securityService";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

/**
 * GET /api/security/:id/audit-logs
 * Lich su thay doi cua mot ho so an ninh cu the - dung cho khu vuc "Lich su
 * chinh sua" trong man chinh sua an ninh o admin.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "security.read");

        const record = await getSecurityRecordById(params.id);
        assertSecurityRecordInScope(user, record);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAuditLogs({
            targetModel: "SecurityRecord",
            targetId: params.id,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
