import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { updateInspectionCampaignDetails } from "@/services/inspectionService";
import { updateInspectionCampaignDetailsSchema } from "@/validators/inspection";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = updateInspectionCampaignDetailsSchema.parse(await req.json());
        return apiSuccess(
            await updateInspectionCampaignDetails(actorUser, params.id, input),
            "Đã cập nhật tên và mục tiêu chiến dịch",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
