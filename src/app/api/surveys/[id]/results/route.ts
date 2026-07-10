import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { getSurveyResults } from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin", "secretary", "neighborhood_leader");
        const results = await getSurveyResults(params.id);
        return apiSuccess(results);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
