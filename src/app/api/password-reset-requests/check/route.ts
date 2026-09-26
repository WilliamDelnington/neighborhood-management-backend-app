import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { checkPasswordResetRequestSchema } from "@/validators/passwordResetRequest";
import { checkPasswordResetRequestByPhone } from "@/services/passwordResetRequestService";

export const dynamic = "force-dynamic";

// Public - cong dan khong dang nhap duoc goi tu man "Quen mat khau" de biet
// yeu cau gan nhat cua minh dang cho xu ly hay da co mat khau moi (state:
// none/pending/ready), KHONG tra ve mat khau (xem /reveal cho buoc ke tiep).
export async function POST(req: Request) {
    try {
        await connectDB();
        const body = checkPasswordResetRequestSchema.parse(await req.json());
        const result = await checkPasswordResetRequestByPhone(body.phone);
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
