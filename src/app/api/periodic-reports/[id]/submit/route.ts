import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { submitPeriodicReport } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.author");
        const report = await submitPeriodicReport(actorUser, params.id);
        return apiSuccess(report, "Đã nộp báo cáo");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
