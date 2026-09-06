import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateCompanyTypeSchema } from "@/validators/companyType";
import {
    deleteCompanyType,
    getCompanyTypeById,
    updateCompanyType,
} from "@/services/companyTypeService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "company_types.read");

        const companyType = await getCompanyTypeById(params.id);
        return apiSuccess(companyType);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "company_types.update");

        const body = updateCompanyTypeSchema.parse(await req.json());
        const companyType = await updateCompanyType(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(companyType, "Cập nhật loại hình doanh nghiệp thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "company_types.delete");

        const result = await deleteCompanyType(
            String(actorUser._id),
            params.id,
        );
        return apiSuccess(result, "Xóa loại hình doanh nghiệp thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
