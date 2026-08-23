import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import {
    getInspectionCampaignById,
    updateInspectionCampaignChecklist,
} from "@/services/inspectionService";
import { updateInspectionCampaignChecklistSchema } from "@/validators/inspection";

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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = updateInspectionCampaignChecklistSchema.parse(await req.json());
        return apiSuccess(
            await updateInspectionCampaignChecklist(actorUser, params.id, input),
            "Đã cập nhật checklist",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
