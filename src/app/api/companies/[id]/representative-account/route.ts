import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createCompanyRepresentativeByOwner } from "@/services/userService";
import { createOwnerManagedAccountSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

/**
 * POST /api/companies/:id/representative-account
 * Chu nha tu tao tai khoan dai dien (company_representative) cho MOT cong ty
 * cu the ma minh dang so huu, va lien ket luon trong 1 buoc - xem
 * userService.createCompanyRepresentativeByOwner.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "companies.update");
        const body = createOwnerManagedAccountSchema.parse(await req.json());
        const created = await createCompanyRepresentativeByOwner(
            user,
            params.id,
            body,
        );
        return apiSuccess(created, "Đã tạo tài khoản đại diện", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
