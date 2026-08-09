import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { confirmRequestRecipientSchema } from "@/validators/request";
import { confirmRequestRecipient } from "@/services/requestService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/requests/:id/recipients/:userId
 * Nguoi quan ly yeu cau xac nhan hoan thanh hoac yeu cau xu ly lai, sau khi
 * nguoi nhan da bao "Chờ xác nhận". Khac voi /recipients/me (nguoi nhan tu
 * cap nhat trang thai cua chinh minh).
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string; userId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = confirmRequestRecipientSchema.parse(await req.json());
        const recipient = await confirmRequestRecipient(
            actorUser,
            params.id,
            params.userId,
            body.decision,
            body.note,
        );
        return apiSuccess(
            recipient,
            body.decision === "resolved"
                ? "Da xac nhan hoan thanh"
                : "Da yeu cau xu ly lai",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
