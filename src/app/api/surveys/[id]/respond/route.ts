import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { respondSurveySchema } from "@/validators/survey";
import { respondToSurvey } from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "surveys.respond");
        const body = respondSurveySchema.parse(await req.json());
        const response = await respondToSurvey(actorUser, params.id, body);
        return apiSuccess(response, "Gửi trả lời khảo sát thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
