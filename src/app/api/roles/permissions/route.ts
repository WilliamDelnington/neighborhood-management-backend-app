import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { getPermissionRegistry } from "@/services/roleService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const session = requireSession(req);
        requireRole(session, "admin");
        return apiSuccess(getPermissionRegistry());
    } catch (err) {
        return apiErrorFromException(err);
    }
}
