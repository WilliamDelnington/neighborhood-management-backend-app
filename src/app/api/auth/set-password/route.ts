import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { setPassword } from "@/services/authService";
import { setPasswordSchema } from "@/validators/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        const body = setPasswordSchema.parse(await req.json());
        const updated = await setPassword(String(user._id), body);
        return apiSuccess(updated, "Cap nhat mat khau thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
