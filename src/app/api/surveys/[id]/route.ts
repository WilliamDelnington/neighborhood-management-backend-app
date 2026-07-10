import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
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
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin", "secretary");
        const body = updateSurveySchema.parse(await req.json());
        const survey = await updateSurvey(
            String(actorUser._id),
            params.id,
            body,
        );
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
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin", "secretary");
        await deleteSurvey(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa khao sat thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
