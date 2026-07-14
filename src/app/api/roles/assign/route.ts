import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { assignRole } from "@/services/userService";
import { assignRoleSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.assign_roles");

        const body = assignRoleSchema.parse(await req.json());
        const result = await assignRole(String(actorUser._id), body);
        return apiSuccess(result, "Gan vai tro thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
