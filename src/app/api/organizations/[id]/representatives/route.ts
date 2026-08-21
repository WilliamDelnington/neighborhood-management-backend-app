import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { addOrganizationRepresentativeSchema } from "@/validators/organizationRepresentative";
import { getOrganizationById } from "@/services/organizationService";
import {
    addOrganizationRepresentative,
    listOrganizationRepresentatives,
} from "@/services/organizationRepresentativeService";

export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/:id/representatives
 * Toan bo nguoi dai dien cua mot to chuc (dang active lan da ket thuc, moi
 * nhat truoc) - dung cho man chi tiet to chuc hien lich su dai dien.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "organizations.read");

        await getOrganizationById(user, params.id);
        const representatives = await listOrganizationRepresentatives(
            params.id,
        );
        return apiSuccess(representatives);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * POST /api/organizations/:id/representatives
 * Them mot nguoi dai dien moi (hoac chuyen nguoi dai dien phap luat, neu
 * role="legal_representative" - xem addOrganizationRepresentative).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "organizations.update");

        await getOrganizationById(user, params.id);
        const body = addOrganizationRepresentativeSchema.parse(
            await req.json(),
        );
        const representative = await addOrganizationRepresentative(
            user,
            params.id,
            body,
        );
        return apiSuccess(
            representative,
            "Cập nhật người đại diện thành công",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
