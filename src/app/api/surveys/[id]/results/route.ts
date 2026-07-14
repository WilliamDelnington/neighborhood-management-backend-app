import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getSurveyResults } from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "surveys.read");
        const results = await getSurveyResults(params.id);
        return apiSuccess(results);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
