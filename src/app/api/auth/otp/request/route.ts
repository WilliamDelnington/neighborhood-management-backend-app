import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiError, apiErrorFromException } from "@/lib/response";
import { isAuthOtpEnabled } from "@/lib/config";
import { otpRequestSchema } from "@/validators/auth";
import { requestOtp } from "@/services/otpService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    if (!isAuthOtpEnabled()) {
        return apiError("Tinh nang dang nhap bang OTP hien khong kha dung", 404);
    }
    try {
        await connectDB();
        const body = otpRequestSchema.parse(await req.json());
        // Khong bao gio dua `code` (chi danh cho test goi truc tiep service)
        // vao response - chi tra ve thong bao chung, khong tiet lo so dien
        // thoai da dang ky hay chua (xem docstring requestOtp).
        await requestOtp(body.phone, body.purpose);
        return apiSuccess(null, "Neu hop le, ma OTP da duoc gui");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
