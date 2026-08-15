import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { createDocumentSchema } from "@/validators/requiredDocument";
import { createDocument } from "@/services/requiredDocumentService";
import { houseDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * POST /api/houses/:id/documents
 * Chu nha (hoac admin) nop mot giay to. Chi yeu cau dang nhap o tang route -
 * quyen "chi chu nha moi duoc nop" kiem tra chi tiet trong service.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const body = createDocumentSchema.parse(await req.json());
        const houseDocument = await createDocument(
            actorUser,
            params.id,
            body,
            houseDocumentAdapter,
        );
        return apiSuccess(houseDocument, "Nop giay to thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
