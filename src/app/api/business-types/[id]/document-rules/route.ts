import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { putDocumentRulesSchema } from "@/validators/businessType";
import { putDocumentRules } from "@/services/businessTypeService";

export const dynamic = "force-dynamic";

/**
 * PUT /api/business-types/:id/document-rules
 * Thay toan bo dong luat "giay to bat buoc/tuy chon" cua mot loai hinh kinh
 * doanh - chi admin (permission business_types.update hien chi duoc gan cho
 * admin trong systemRoles mac dinh).
 */
export async function PUT(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "business_types.update");

        const body = putDocumentRulesSchema.parse(await req.json());
        const businessType = await putDocumentRules(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(businessType, "Cap nhat dong luat giay to thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
