import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { endOrganizationRepresentativeSchema } from "@/validators/organizationRepresentative";
import { getOrganizationById } from "@/services/organizationService";
import { endOrganizationRepresentative } from "@/services/organizationRepresentativeService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/organizations/:id/representatives/:representativeId
 * Ket thuc mot quan he dai dien (khong xoa - giu lai lich su, xem
 * endOrganizationRepresentative).
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string; representativeId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "organizations.update");

        await getOrganizationById(user, params.id);
        const body = endOrganizationRepresentativeSchema.parse(
            await req.json(),
        );
        const representative = await endOrganizationRepresentative(
            user,
            params.id,
            params.representativeId,
            body.reason,
        );
        return apiSuccess(representative, "Da ket thuc quan he dai dien");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
