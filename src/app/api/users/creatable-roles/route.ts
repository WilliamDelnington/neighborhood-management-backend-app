import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getCreatableRolesForActor } from "@/services/userService";

export const dynamic = "force-dynamic";

/**
 * Danh sach vai tro (key + ten) ma actor dang dang nhap duoc phep chon khi
 * "Tạo tài khoản" (POST /api/users) - dung cho ca 3 app (admin-web-app,
 * resident-web-app, Zalo Mini App) de hien dropdown vai tro dung voi tung
 * nguoi dung, thay vi tu suy luan rule o client - xem
 * userService.getCreatableRolesForActor.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.create");

        const roles = await getCreatableRolesForActor(actorUser);
        return apiSuccess(roles);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
