import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { setPasswordSchema } from "@/validators/auth";
import { setPassword } from "@/services/authService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        const body = setPasswordSchema.parse(await req.json());
        const result = await setPassword(String(user._id), body.password);
        return apiSuccess(result, "Da dat mat khau dang nhap");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
