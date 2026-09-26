import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getSurveyOverview } from "@/services/surveyService";

export const dynamic = "force-dynamic";

/**
 * GET /api/surveys/:id/overview
 * Trang chi tiet (chi xem) khao sat o admin-web-app - kem nguoi tao, dong chu
 * bien, doi tuong va trang thai cua chinh nguoi xem (xem getSurveyOverview).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "surveys.read");
        const overview = await getSurveyOverview(params.id, actorUser);
        return apiSuccess(overview);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
