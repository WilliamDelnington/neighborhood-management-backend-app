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
        const survey = await closeSurvey(String(actorUser._id), params.id);
        return apiSuccess(survey, "Dong khao sat thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
