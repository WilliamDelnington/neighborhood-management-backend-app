import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { User } from "@/models";
import { getUserById, getUserManagementScope } from "@/services/userService";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/:id/management-scope
 * "Phạm vi quản lý" cua nguoi dung - xem userService.getUserManagementScope.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.read");

        // Ap dung lai dung gioi han pham vi cua getUserById truoc khi tra pham
        // vi quan ly cua nguoi dung do.
        await getUserById(actorUser, params.id);

        const targetUser = await User.findById(params.id);
        if (!targetUser) throw new HttpError("Không tìm thấy người dùng", 404);

        const scopes = await getUserManagementScope(targetUser);
        return apiSuccess({ scopes });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
