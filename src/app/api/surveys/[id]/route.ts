import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { updateSurveySchema } from "@/validators/survey";
import {
    deleteSurvey,
    getSurveyById,
    updateSurvey,
} from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const survey = await getSurveyById(params.id);
        return apiSuccess(survey);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin", "secretary");
        const body = updateSurveySchema.parse(await req.json());
        const survey = await updateSurvey(session.userId, params.id, body);
        return apiSuccess(survey, "Cap nhat khao sat thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin", "secretary");
        await deleteSurvey(session.userId, params.id);
        return apiSuccess(null, "Xoa khao sat thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
