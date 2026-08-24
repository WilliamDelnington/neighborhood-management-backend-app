import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { createDocumentSchema } from "@/validators/requiredDocument";
import { createDocument } from "@/services/requiredDocumentService";
import { companyDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * POST /api/companies/:id/documents
 * Dai dien cong ty (hoac admin) nop mot giay to. Chi yeu cau dang nhap o tang
 * route - quyen "chi chu cong ty moi duoc nop" kiem tra chi tiet trong
 * service.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const body = createDocumentSchema.parse(await req.json());
        const companyDocument = await createDocument(
            actorUser,
            params.id,
            body,
            companyDocumentAdapter,
        );
        return apiSuccess(companyDocument, "Nộp giấy tờ thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
