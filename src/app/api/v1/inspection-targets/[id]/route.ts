import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getInspectionTargetById } from "@/services/inspectionService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requireAnyPermission(actorUser, ["inspections.read", "inspections.execute"]);
        return apiSuccess(await getInspectionTargetById(actorUser, params.id));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
