import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { resetUserPasswordSchema } from "@/validators/user";
import { resetUserPasswordByAdmin } from "@/services/userService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.reset_password");

        const body = resetUserPasswordSchema.parse(await req.json());
        await resetUserPasswordByAdmin(actorUser, params.id, body);
        return apiSuccess(null, "Đã đặt lại mật khẩu");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
