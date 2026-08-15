import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { putRequiredDocumentsSchema } from "@/validators/requiredDocument";
import { putRequiredDocuments } from "@/services/requiredDocumentService";
import { companyDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * PUT /api/companies/:id/document-rules
 * Thay toan bo dong luat "giay to bat buoc/tuy chon" cua MOT cong ty cu the -
 * khac Business (dong luat nam tren BusinessType dung chung).
 */
export async function PUT(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "companies.update");

        const body = putRequiredDocumentsSchema.parse(await req.json());
        const company = await putRequiredDocuments(
            String(actorUser._id),
            params.id,
            body,
            companyDocumentAdapter,
        );
        return apiSuccess(company, "Cap nhat yeu cau giay to thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
