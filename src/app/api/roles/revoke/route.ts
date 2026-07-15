import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { revokeRole } from "@/services/userService";
import { revokeRoleSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.assign_roles");

        const body = revokeRoleSchema.parse(await req.json());
        const user = await revokeRole(String(actorUser._id), body.userId, body.role);
        return apiSuccess(user, "Thu hoi vai tro thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
