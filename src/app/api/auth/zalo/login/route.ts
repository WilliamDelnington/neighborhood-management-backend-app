import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { zaloLoginSchema } from "@/validators/auth";
import { loginWithZalo } from "@/services/authService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const body = zaloLoginSchema.parse(await req.json());
        const result = await loginWithZalo(body);
        return apiSuccess(result, "Dang nhap thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
