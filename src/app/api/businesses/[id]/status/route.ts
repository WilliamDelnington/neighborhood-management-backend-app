import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { updateBusinessStatusSchema } from "@/validators/business";
import { transitionBusinessStatus } from "@/services/businessService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/businesses/:id/status
 * Chuyen trang thai xac thuc thu cong - admin ghi de tuy y, chu ho chi duoc
 * gui lai ("denied" -> "pending"). Luong binh thuong (chu ho nop giay to,
 * nguoi phu trach duyet tung giay to) khong di qua route nay - xem
 * /api/businesses/:id/documents va /api/businesses/:id/documents/:documentId/review.
 * O day chi loc tho (phai co it nhat mot trong hai quyen lien quan) - luat chi
 * tiet nam trong transitionBusinessStatus, mirror /api/houses/:id/status.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, ["businesses.update", "businesses.verify"]);

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
