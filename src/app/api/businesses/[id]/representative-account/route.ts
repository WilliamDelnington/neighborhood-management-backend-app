import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createBusinessRepresentativeByOwner } from "@/services/userService";
import { createOwnerManagedAccountSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

/**
 * POST /api/businesses/:id/representative-account
 * Chu nha tu tao tai khoan dai dien (business_representative) cho MOT ho
 * kinh doanh cu the ma minh dang so huu, va lien ket luon trong 1 buoc - xem
 * userService.createBusinessRepresentativeByOwner.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "businesses.update");
        const body = createOwnerManagedAccountSchema.parse(await req.json());
        const created = await createBusinessRepresentativeByOwner(
            user,
            params.id,
            body,
        );
        return apiSuccess(created, "Đã tạo tài khoản đại diện", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
