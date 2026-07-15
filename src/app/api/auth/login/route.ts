import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { phoneLoginSchema } from "@/validators/auth";
import { loginWithPhone } from "@/services/authService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const body = phoneLoginSchema.parse(await req.json());
        const result = await loginWithPhone(body);
        return apiSuccess(result, "Dang nhap thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
