import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { putRequiredDocumentsSchema } from "@/validators/requiredDocument";
import {
    getRequiredDocumentSettings,
    putRequiredDocuments,
} from "@/services/requiredDocumentService";
import { companyDocumentAdapter } from "@/services/requiredDocumentAdapters";

export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/companies/document-rules
 * Dong luat "giay to bat buoc/tuy chon" AP DUNG CHUNG cho TOAN BO cong ty
 * (khong phai mot cong ty cu the).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "companies.update");

        const requiredDocuments = await getRequiredDocumentSettings(
            companyDocumentAdapter,
        );
        return apiSuccess({ requiredDocuments });
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PUT(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "companies.update");

        const body = putRequiredDocumentsSchema.parse(await req.json());
        const settings = await putRequiredDocuments(
            String(actorUser._id),
            body,
            companyDocumentAdapter,
        );
        return apiSuccess(settings, "Cập nhật yêu cầu giấy tờ thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
