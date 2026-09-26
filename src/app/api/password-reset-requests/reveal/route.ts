import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { checkPasswordResetRequestSchema } from "@/validators/passwordResetRequest";
import { revealPasswordResetRequest } from "@/services/passwordResetRequestService";

export const dynamic = "force-dynamic";

// Public - lay mat khau moi MOT LAN DUY NHAT sau khi check tra ve state
// "ready". Goi lai lan hai se 404 (mat khau da bi xoa khoi DB ngay sau lan
// lay dau tien - xem revealPasswordResetRequest).
export async function POST(req: Request) {
    try {
        await connectDB();
        const body = checkPasswordResetRequestSchema.parse(await req.json());
        const password = await revealPasswordResetRequest(body.phone);
        return apiSuccess({ password });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
