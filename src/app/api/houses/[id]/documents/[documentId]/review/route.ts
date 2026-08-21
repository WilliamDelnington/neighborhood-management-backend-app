import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { reviewDocumentSchema } from "@/validators/requiredDocument";
import { reviewDocument } from "@/services/requiredDocumentService";
import { houseDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * PUT /api/houses/:id/documents/:documentId/review
 * Duyet/tu choi mot giay to dang cho duyet. Chi yeu cau dang nhap o tang
 * route - quyen duyet (dung vai tro theo dong luat, hoac fallback
 * houses.verify) kiem tra chi tiet trong service.
 */
export async function PUT(
    req: Request,
    { params }: { params: { id: string; documentId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const body = reviewDocumentSchema.parse(await req.json());
        const houseDocument = await reviewDocument(
            actorUser,
            params.id,
            params.documentId,
            body.decision,
            body.rejectionReason,
            body.approvalNote,
            houseDocumentAdapter,
        );
        return apiSuccess(houseDocument, "Cập nhật kết quả duyệt thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
