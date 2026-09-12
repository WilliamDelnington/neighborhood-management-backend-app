import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { countUnansweredSurveys } from "@/services/surveyService";

export const dynamic = "force-dynamic";

/**
 * GET /api/surveys/unanswered-count
 * So khao sat dang mo ma nguoi dang nhap du dieu kien tra loi nhung chua tra
 * loi - dung cho badge so luong canh muc "Khảo sát" tren menu (ca admin web
 * app lan mini app cu dan).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const count = await countUnansweredSurveys(actorUser);
        return apiSuccess({ count });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
