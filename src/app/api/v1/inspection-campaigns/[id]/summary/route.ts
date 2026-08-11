import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getInspectionSummary } from "@/services/inspectionService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "inspections.read");
        const neighborhoodId = new URL(req.url).searchParams.get("neighborhoodId") || undefined;
        return apiSuccess(await getInspectionSummary(actorUser, params.id, neighborhoodId));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
