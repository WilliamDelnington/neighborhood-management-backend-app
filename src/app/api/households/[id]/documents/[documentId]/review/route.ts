import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { reviewDocumentSchema } from "@/validators/requiredDocument";
import { reviewDocument } from "@/services/requiredDocumentService";
import { householdDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * PUT /api/households/:id/documents/:documentId/review
 * Duyet/tu choi mot giay to dang cho duyet. Chi yeu cau dang nhap o tang
 * route - quyen duyet (dung vai tro theo dong luat, hoac fallback
 * households.verify) kiem tra chi tiet trong service.
 */
export async function PUT(
    req: Request,
    { params }: { params: { id: string; documentId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const body = reviewDocumentSchema.parse(await req.json());
        const householdDocument = await reviewDocument(
            actorUser,
            params.id,
            params.documentId,
            body.decision,
            body.rejectionReason,
            body.approvalNote,
            householdDocumentAdapter,
        );
        return apiSuccess(householdDocument, "Cap nhat ket qua duyet thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
