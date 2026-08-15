import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { reviewDocumentSchema } from "@/validators/requiredDocument";
import { reviewDocument } from "@/services/requiredDocumentService";
import { companyDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * PUT /api/companies/:id/documents/:documentId/review
 * Duyet/tu choi mot giay to dang cho duyet. Chi yeu cau dang nhap o tang
 * route - quyen duyet (dung vai tro theo dong luat, hoac fallback
 * companies.verify) kiem tra chi tiet trong service.
 */
export async function PUT(
    req: Request,
    { params }: { params: { id: string; documentId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const body = reviewDocumentSchema.parse(await req.json());
        const companyDocument = await reviewDocument(
            actorUser,
            params.id,
            params.documentId,
            body.decision,
            body.rejectionReason,
            body.approvalNote,
            companyDocumentAdapter,
        );
        return apiSuccess(companyDocument, "Cap nhat ket qua duyet thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
