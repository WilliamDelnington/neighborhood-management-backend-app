import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission, optionalUser } from "@/lib/rbac";
import { updateSurveySchema } from "@/validators/survey";
import {
    deleteSurvey,
    getSurveyById,
    updateSurvey,
} from "@/services/surveyService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const viewerUser = await optionalUser(req);
        const survey = await getSurveyById(params.id, viewerUser);
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
        await requirePermission(actorUser, "surveys.update");
        const body = updateSurveySchema.parse(await req.json());
        const survey = await updateSurvey(actorUser, params.id, body);
        return apiSuccess(survey, "Cập nhật khảo sát thành công");
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
        await requirePermission(actorUser, "surveys.update");
        await deleteSurvey(actorUser, params.id);
        return apiSuccess(null, "Xóa khảo sát thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
