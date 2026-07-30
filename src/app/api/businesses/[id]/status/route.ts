import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { updateBusinessStatusSchema } from "@/validators/business";
import { transitionBusinessStatus } from "@/services/businessService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/businesses/:id/status
 * Ghi de thu cong trang thai xac thuc - CHI danh cho admin (vd reset lai ho
 * so). Luong binh thuong (chu ho nop giay to, nguoi phu trach duyet tung
 * giay to) khong con di qua route nay - xem
 * /api/businesses/:id/documents va /api/businesses/:id/documents/:documentId/review.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, "admin");

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
