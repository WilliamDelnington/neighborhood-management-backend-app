import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess, paginationParams } from "@/lib/response";
import { listInspectionCampaigns } from "@/services/inspectionService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "inspections.read");
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        return apiSuccess(await listInspectionCampaigns({
            actorUser,
            page,
            limit,
            status: searchParams.get("status") || undefined,
        }));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
