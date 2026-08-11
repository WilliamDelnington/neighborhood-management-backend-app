import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { searchHousesForComplaintTarget } from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/lookup?search=...
 * Tim kiem nha so rut gon, KHONG loc theo pham vi so huu/phu trach - dung cho
 * luong chon "nha so lien quan" khi gui phan anh (nguoi gui co the bao ve
 * mot nha khong phai cua ho). Gate boi complaints.create (khong phai
 * houses.read) vi day la buoc phu cua viec gui phan anh, khong phai thao tac
 * quan ly nha so - xem searchHousesForComplaintTarget.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "complaints.create");

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || undefined;
        const items = await searchHousesForComplaintTarget(search);
        return apiSuccess(items);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
