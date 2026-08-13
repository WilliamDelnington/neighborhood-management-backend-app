import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { initiateRequestTransferSchema } from "@/validators/request";
import { initiateRequestTransfer } from "@/services/requestService";

export const dynamic = "force-dynamic";

/**
 * POST /api/requests/:id/recipients/me/transfer
 * Nguoi nhan hien tai (chinh nguoi dang dang nhap) de nghi chuyen tiep yeu cau
 * cho mot nguoi khac, kem ly do bat buoc.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = initiateRequestTransferSchema.parse(await req.json());
        const recipient = await initiateRequestTransfer(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(recipient, "Da gui de nghi chuyen tiep yeu cau");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
