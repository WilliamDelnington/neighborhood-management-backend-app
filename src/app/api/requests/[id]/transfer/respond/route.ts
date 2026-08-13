import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { respondToRequestTransferSchema } from "@/validators/request";
import { respondToRequestTransfer } from "@/services/requestService";

export const dynamic = "force-dynamic";

/**
 * POST /api/requests/:id/transfer/respond
 * Nguoi duoc de nghi chuyen (transferToUserId) hoac nguoi gui goc
 * (request.createdBy) chap nhan/tu choi de nghi chuyen tiep dang cho xu ly.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = respondToRequestTransferSchema.parse(await req.json());
        const recipient = await respondToRequestTransfer(
            actorUser,
            params.id,
            body.decision,
        );
        return apiSuccess(
            recipient,
            body.decision === "accept"
                ? "Da chap nhan chuyen tiep yeu cau"
                : "Da tu choi chuyen tiep yeu cau",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
