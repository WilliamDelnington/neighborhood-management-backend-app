import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateOrganizationSchema } from "@/validators/organization";
import {
    getOrganizationById,
    updateOrganization,
} from "@/services/organizationService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "organizations.read");

        const organization = await getOrganizationById(user, params.id);
        return apiSuccess(organization);
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
        await requirePermission(user, "organizations.update");

        const body = updateOrganizationSchema.parse(await req.json());
        const organization = await updateOrganization(user, params.id, body);
        return apiSuccess(organization, "Cap nhat to chuc thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
