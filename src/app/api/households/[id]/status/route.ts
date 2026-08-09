import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { updateHouseholdStatusSchema } from "@/validators/household";
import { transitionHouseholdStatus } from "@/services/householdService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/households/:id/status
 * Chuyen trang thai xac thuc cua ho dan (gui duyet / duyet / tu choi / khoa).
 * Kiem tra quyen chi tiet (chu ho vs nhan vien xac thuc vs admin) nam trong
 * transitionHouseholdStatus - o day chi loc tho: phai co it nhat mot trong hai
 * quyen lien quan, mirror /api/houses/:id/status.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, ["households.update", "households.verify"]);

        const body = updateHouseholdStatusSchema.parse(await req.json());
        const household = await transitionHouseholdStatus(
            user,
            params.id,
            body.status,
            body.note,
        );
        return apiSuccess(household, "Cap nhat trang thai ho dan thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
