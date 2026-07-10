import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
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
        const body = respondSurveySchema.parse(await req.json());
        const response = await respondToSurvey(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(response, "Gui tra loi khao sat thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
