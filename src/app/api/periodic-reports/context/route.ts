import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getPeriodicReportContext } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.author");
        const neighborhoodId = new URL(req.url).searchParams.get("neighborhoodId") || undefined;
        return apiSuccess(await getPeriodicReportContext(actorUser, neighborhoodId));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
