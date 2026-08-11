import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { transitionInspectionCampaign } from "@/services/inspectionService";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        return apiSuccess(
            await transitionInspectionCampaign(actorUser, params.id, "lock"),
            "Đã khóa chiến dịch",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
