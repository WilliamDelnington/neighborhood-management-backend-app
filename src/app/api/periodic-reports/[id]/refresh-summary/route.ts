import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { refreshPeriodicReportSummary } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.author");
        return apiSuccess(
            await refreshPeriodicReportSummary(actorUser, params.id),
            "Da cap nhat so lieu tu dong",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
