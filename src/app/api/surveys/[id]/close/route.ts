import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { closeSurvey } from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "surveys.publish");
        const survey = await closeSurvey(actorUser, params.id);
        return apiSuccess(survey, "Đóng khảo sát thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
