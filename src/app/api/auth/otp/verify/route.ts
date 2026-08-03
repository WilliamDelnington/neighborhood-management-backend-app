import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiError, apiErrorFromException } from "@/lib/response";
import { isAuthOtpEnabled } from "@/lib/config";
import { otpVerifySchema } from "@/validators/auth";
import { verifyOtpAndAuthenticate } from "@/services/otpService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    if (!isAuthOtpEnabled()) {
        return apiError("Tinh nang dang nhap bang OTP hien khong kha dung", 404);
    }
    try {
        await connectDB();
        const body = otpVerifySchema.parse(await req.json());
        const result = await verifyOtpAndAuthenticate(
            body.phone,
            body.purpose,
            body.code,
            body.displayName,
        );
        return apiSuccess(result, "Xac thuc OTP thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
