import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { closeSurvey } from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin", "secretary");
        const survey = await closeSurvey(session.userId, params.id);
        return apiSuccess(survey, "Dong khao sat thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
