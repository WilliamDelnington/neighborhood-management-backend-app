import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { getUserManagementScope } from "@/services/userService";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me/management-scope
 * "Phạm vi quản lý" cua CHINH nguoi dang dang nhap (vd to truong dang phu
 * trach to dan pho nao) - xem userService.getUserManagementScope. Khac
 * /api/users/:id/management-scope (can users.read), endpoint nay khong doi
 * quyen gi ngoai dang nhap vi chi tra ve du lieu cua chinh actor.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const scopes = await getUserManagementScope(actorUser);
        return apiSuccess({ scopes });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
