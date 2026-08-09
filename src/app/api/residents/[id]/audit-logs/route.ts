import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    assertResidentRecordInScope,
    getResidentRecordById,
} from "@/services/residentService";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

/**
 * GET /api/residents/:id/audit-logs
 * Lich su thay doi cua mot ho so cu tru cu the.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "residents.read");

        const record = await getResidentRecordById(params.id);
        assertResidentRecordInScope(user, record);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAuditLogs({
            targetModel: "ResidentRecord",
            targetId: params.id,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
