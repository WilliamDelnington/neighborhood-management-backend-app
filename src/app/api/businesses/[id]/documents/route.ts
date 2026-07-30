import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { createBusinessDocumentSchema } from "@/validators/businessDocument";
import { createBusinessDocument } from "@/services/businessDocumentService";

export const dynamic = "force-dynamic";

/**
 * POST /api/businesses/:id/documents
 * Chu ho kinh doanh (hoac admin) nop mot giay to. Chi yeu cau dang nhap o
 * tang route - quyen "chi chu ho moi duoc nop" kiem tra chi tiet trong
 * service (khong chi dua vao permission co dinh).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const body = createBusinessDocumentSchema.parse(await req.json());
        const businessDocument = await createBusinessDocument(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(businessDocument, "Nop giay to thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
