import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { evaluateKpis } from "@/services/kpiService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.kpi_read");
        const { searchParams } = new URL(req.url);
        const fromDate = searchParams.get("fromDate");
        const toDate = searchParams.get("toDate");
        return apiSuccess(
            await evaluateKpis(actorUser, {
                fromDate: fromDate ? new Date(fromDate) : undefined,
                toDate: toDate ? new Date(toDate) : undefined,
                neighborhoodId: searchParams.get("neighborhoodId") || undefined,
            }),
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
