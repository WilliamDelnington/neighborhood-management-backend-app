import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess, paginationParams } from "@/lib/response";
import { listInspectionTargets } from "@/services/inspectionService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "inspections.read");
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const pendingFilter = searchParams.get("pending") || undefined;
        return apiSuccess(await listInspectionTargets({
            actorUser,
            campaignId: params.id,
            page,
            limit,
            resultStatus: searchParams.get("resultStatus") || undefined,
            selfDeclarationStatus: searchParams.get("selfDeclarationStatus") || undefined,
            pendingFilter: pendingFilter as "not_sent" | "unopened" | "not_submitted" | "overdue" | undefined,
            neighborhoodId: searchParams.get("neighborhoodId") || undefined,
        }));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
