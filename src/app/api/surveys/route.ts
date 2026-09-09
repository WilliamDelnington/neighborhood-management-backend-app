import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission, optionalUser } from "@/lib/rbac";
import { createSurveySchema } from "@/validators/survey";
import { createSurvey, listSurveys } from "@/services/surveyService";

export const dynamic = "force-dynamic";

/**
 * GET khong bat buoc dang nhap (de nhan vien quan ly khao sat - co quyen
 * "surveys.read" - va nguoi tra loi deu dung chung 1 API), nhung KHONG con
 * "cong khai" theo nghia moi nguoi thay giong nhau: neu nguoi goi khong co
 * quyen "surveys.read", danh sach tra ve se AN het cac khao sat "nhap" (draft)
 * va CHI gom cac khao sat ho du dieu kien tra loi (isSurveyEligible) - xem
 * surveyService.listSurveys. Nguoi co quyen "surveys.read" van thay day du
 * (ke ca draft, khong loc dieu kien) de phuc vu quan ly.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const viewerUser = await optionalUser(req);
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listSurveys({
            page,
            limit,
            openOnly: searchParams.get("openOnly") === "1",
            viewerUser,
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
        const survey = await createSurvey(actorUser, body);
        return apiSuccess(survey, "Tạo khảo sát thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
