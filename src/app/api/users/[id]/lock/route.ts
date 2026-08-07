import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { lockUserStatus } from "@/services/userService";
import { lockUserStatusSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/:id/lock
 * Khoa/mo tai khoan chu nha - quyen HEP hon PATCH /api/users/:id (users.update):
 * chi doi status + ly do bat buoc, gioi han theo pham vi to dan pho neu actor
 * la to truong (khong phai admin) - xem userService.lockUserStatus.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requireAnyPermission(actorUser, ["users.lock", "users.update"]);

        const body = lockUserStatusSchema.parse(await req.json());
        const user = await lockUserStatus(actorUser, params.id, body);
        return apiSuccess(user, "Cap nhat trang thai tai khoan thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
