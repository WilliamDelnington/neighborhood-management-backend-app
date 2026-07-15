import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createSurveySchema } from "@/validators/survey";
import { createSurvey, listSurveys } from "@/services/surveyService";

export const dynamic = "force-dynamic";

/**
 * GET cong khai: xem danh sach khao sat (co the loc openOnly=1 de chi lay khao sat dang mo).
 * Khong yeu cau dang nhap de duyet danh sach; viec kiem tra dieu kien tra loi (eligibleRoles/
 * eligibleClusters) duoc thuc hien khi goi API tra loi (xem surveyService.respondToSurvey).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listSurveys({
            page,
            limit,
            openOnly: searchParams.get("openOnly") === "1",
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "surveys.create");
        const body = createSurveySchema.parse(await req.json());
        const survey = await createSurvey(String(actorUser._id), body);
        return apiSuccess(survey, "Tao khao sat thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
