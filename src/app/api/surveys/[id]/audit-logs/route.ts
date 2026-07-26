import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getSurveyById } from "@/services/surveyService";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

/**
 * GET /api/surveys/:id/audit-logs
 * Lich su thay doi cua mot khao sat cu the - dung cho khu vuc "Lich su chinh
 * sua" trong man chinh sua khao sat o admin. Gate bang surveys.update (khong
 * phai surveys.read) vi module khao sat hien khong co permission rieng cho
 * "chi xem" - xem GET/PATCH /api/surveys/[id]/route.ts.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "surveys.update");

        await getSurveyById(params.id);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAuditLogs({
            targetModel: "Survey",
            targetId: params.id,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
