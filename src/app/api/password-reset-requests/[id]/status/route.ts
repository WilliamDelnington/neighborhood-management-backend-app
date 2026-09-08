import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updatePasswordResetRequestStatusSchema } from "@/validators/passwordResetRequest";
import { updatePasswordResetRequestStatus } from "@/services/passwordResetRequestService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.reset_password");
        const body = updatePasswordResetRequestStatusSchema.parse(
            await req.json(),
        );
        const updated = await updatePasswordResetRequestStatus(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(updated, "Cập nhật trạng thái thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
