import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { globalSearch } from "@/services/searchService";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=...
 * Tim kiem tong hop tren Nha so/Ho dan/Ho kinh doanh/Cong ty/Nhan khau/Tai
 * khoan cho o tim kiem tren header admin-web-app (xem searchService.ts). Chi
 * yeu cau dang nhap hop le (khong gate boi mot permission co dinh nao) - moi
 * loai du lieu tu loc theo permission + pham vi rieng cua actorUser ben trong
 * globalSearch, nen ket qua tra ve khong bao gio vuot qua nhung gi actorUser
 * da duoc xem o man danh sach tuong ung.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);

        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const items = await globalSearch(q, user);
        return apiSuccess({ items });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
