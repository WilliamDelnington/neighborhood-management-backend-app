import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { updateBusinessStatusSchema } from "@/validators/business";
import { transitionBusinessStatus } from "@/services/businessService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/businesses/:id/status
 * Chuyen trang thai xac thuc cua ho kinh doanh (gui duyet / duyet / tu choi /
 * khoa). Kiem tra quyen chi tiet (chu ho vs nhan vien xac thuc vs admin) nam
 * trong transitionBusinessStatus - o day chi loc tho, giong het route tuong
 * ung cua nha so (houses/:id/status).
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, [
            "businesses.update",
            "businesses.verify",
        ]);

        const body = updateBusinessStatusSchema.parse(await req.json());
        const business = await transitionBusinessStatus(
            user,
            params.id,
            body.status,
        );
        return apiSuccess(business, "Cap nhat trang thai ho kinh doanh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
