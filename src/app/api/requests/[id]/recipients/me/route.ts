import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { updateMyRequestStatusSchema } from "@/validators/request";
import { updateMyRequestStatus } from "@/services/requestService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/requests/:id/recipients/me
 * Nguoi nhan tu cap nhat trang thai xu ly cua chinh minh doi voi yeu cau.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = updateMyRequestStatusSchema.parse(await req.json());
        const recipient = await updateMyRequestStatus(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(recipient, "Cap nhat trang thai thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
