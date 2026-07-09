import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession } from "@/lib/rbac";
import { respondSurveySchema } from "@/validators/survey";
import { respondToSurvey } from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        const body = respondSurveySchema.parse(await req.json());
        const response = await respondToSurvey(session.userId, params.id, body);
        return apiSuccess(response, "Gui tra loi khao sat thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
