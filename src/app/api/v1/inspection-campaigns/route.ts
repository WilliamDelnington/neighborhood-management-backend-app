import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { createInspectionCampaign } from "@/services/inspectionService";
import { createInspectionCampaignSchema } from "@/validators/inspection";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = createInspectionCampaignSchema.parse(await req.json());
        return apiSuccess(
            await createInspectionCampaign(actorUser, input),
            "Đã tạo bản nháp chiến dịch rà soát",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
