import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    getSurveyIndividualResponses,
    requireOwnedSurvey,
} from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "surveys.read");
        // Cung dieu kien voi /results (chi owner/dong chu bien/admin) vi day la
        // du lieu nhay cam hon: lo ai da tra loi gi, khong chi so lieu tong hop.
        await requireOwnedSurvey(actorUser, params.id);
        const responses = await getSurveyIndividualResponses(params.id);
        return apiSuccess(responses);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
