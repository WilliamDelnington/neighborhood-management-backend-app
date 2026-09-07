import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createPasswordResetRequestSchema } from "@/validators/passwordResetRequest";
import {
    createPasswordResetRequest,
    listPasswordResetRequests,
} from "@/services/passwordResetRequestService";

export const dynamic = "force-dynamic";

// Public - nguoi gui KHONG dang nhap duoc (quen mat khau) nen khong the qua
// requireUser. Luon tra ve cung mot thong bao thanh cong bat ke so dien thoai
// co ton tai tai khoan hay khong, tranh do tim so da dang ky (cung quy uoc
// voi requestOtp).
export async function POST(req: Request) {
    try {
        await connectDB();
        const body = createPasswordResetRequestSchema.parse(await req.json());
        await createPasswordResetRequest(body);
        return apiSuccess(
            null,
            "Đã gửi yêu cầu, vui lòng chờ được hỗ trợ",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.reset_password");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listPasswordResetRequests({
            page,
            limit,
            status: searchParams.get("status") || undefined,
            search: searchParams.get("search") || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
