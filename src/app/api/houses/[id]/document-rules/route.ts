import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { putRequiredDocumentsSchema } from "@/validators/requiredDocument";
import { putRequiredDocuments } from "@/services/requiredDocumentService";
import { houseDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * PUT /api/houses/:id/document-rules
 * Thay toan bo dong luat "giay to bat buoc/tuy chon" cua MOT nha so cu the -
 * khac Business (dong luat nam tren BusinessType dung chung).
 */
export async function PUT(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "houses.update");

        const body = putRequiredDocumentsSchema.parse(await req.json());
        const houseRecord = await putRequiredDocuments(
            String(actorUser._id),
            params.id,
            body,
            houseDocumentAdapter,
        );
        return apiSuccess(houseRecord, "Cap nhat yeu cau giay to thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
