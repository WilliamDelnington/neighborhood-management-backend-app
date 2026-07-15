import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { MODULE_PERMISSION_REGISTRY } from "@/lib/permissionRegistry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "roles.read");

        return apiSuccess(MODULE_PERMISSION_REGISTRY);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
