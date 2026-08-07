import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getUserById, updateUserByAdmin } from "@/services/userService";
import { updateUserSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.read");
        const user = await getUserById(actorUser, params.id);
        return apiSuccess(user);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.update");
        const body = updateUserSchema.parse(await req.json());
        const user = await updateUserByAdmin(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(user, "Cap nhat nguoi dung thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
