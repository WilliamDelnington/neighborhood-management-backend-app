import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createHouseholdHeadByOwner } from "@/services/userService";
import { createOwnerManagedAccountSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

/**
 * POST /api/households/:id/head-account
 * Chu nha tu tao tai khoan chu ho (household_head) cho MOT ho dan cu the ma
 * minh dang so huu, va lien ket luon trong 1 buoc (xem
 * userService.createHouseholdHeadByOwner - kiem tra quyen so huu ngay trong
 * service, khong chi dua vao permission o day).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "households.update");
        const body = createOwnerManagedAccountSchema.parse(await req.json());
        const created = await createHouseholdHeadByOwner(user, params.id, body);
        return apiSuccess(created, "Đã tạo tài khoản chủ hộ", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
