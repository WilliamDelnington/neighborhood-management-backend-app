import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { reviewBusinessDocumentSchema } from "@/validators/businessDocument";
import { reviewBusinessDocument } from "@/services/businessDocumentService";

export const dynamic = "force-dynamic";

/**
 * PUT /api/businesses/:id/documents/:documentId/review
 * Duyet/tu choi mot giay to dang cho duyet. Chi yeu cau dang nhap o tang
 * route - quyen duyet (dung vai tro theo dong luat, hoac fallback
 * businesses.verify) kiem tra chi tiet trong service.
 */
export async function PUT(
    req: Request,
    { params }: { params: { id: string; documentId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const body = reviewBusinessDocumentSchema.parse(await req.json());
        const businessDocument = await reviewBusinessDocument(
            actorUser,
            params.id,
            params.documentId,
            body.decision,
            body.rejectionReason,
            body.approvalNote,
        );
        return apiSuccess(businessDocument, "Cap nhat ket qua duyet thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
