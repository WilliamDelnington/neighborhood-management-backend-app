import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getInspectionCampaignById } from "@/services/inspectionService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "inspections.read");
        return apiSuccess(await getInspectionCampaignById(actorUser, params.id));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
