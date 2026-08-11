import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { verifyOrganizationRepresentativeSchema } from "@/validators/organizationRepresentative";
import { getOrganizationById } from "@/services/organizationService";
import { verifyOrganizationRepresentative } from "@/services/organizationRepresentativeService";

export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/:id/representatives/:representativeId/verify
 * Xac thuc/tu choi mot quan he dai dien dang cho xac thuc.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string; representativeId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "organizations.verify");

        await getOrganizationById(user, params.id);
        const body = verifyOrganizationRepresentativeSchema.parse(
            await req.json(),
        );
        const representative = await verifyOrganizationRepresentative(
            user,
            params.id,
            params.representativeId,
            body.decision,
            body.note,
        );
        return apiSuccess(representative, "Da cap nhat trang thai xac thuc");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
