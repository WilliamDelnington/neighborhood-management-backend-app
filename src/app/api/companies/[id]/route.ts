import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateCompanySchema } from "@/validators/company";
import {
    getCompanyById,
    updateCompany,
    deleteCompany,
} from "@/services/companyService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "companies.read");

        const company = await getCompanyById(params.id);
        return apiSuccess(company);
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
        const user = await requireUser(req);
        await requirePermission(user, "companies.update");

        const body = updateCompanySchema.parse(await req.json());
        const company = await updateCompany(user, params.id, body);
        return apiSuccess(company, "Cap nhat cong ty thanh cong");
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
        const user = await requireUser(req);
        await requirePermission(user, "companies.delete");

        await deleteCompany(user, params.id);
        return apiSuccess(null, "Xoa cong ty thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
