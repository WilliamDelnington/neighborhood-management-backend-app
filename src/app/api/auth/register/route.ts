import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { phoneRegisterSchema } from "@/validators/auth";
import { registerWithPhone } from "@/services/authService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const body = phoneRegisterSchema.parse(await req.json());
        const result = await registerWithPhone(body);
        return apiSuccess(result, "Đăng ký thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
