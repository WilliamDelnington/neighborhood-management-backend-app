import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { scanPois } from "@/services/poiService";

export const dynamic = "force-dynamic";

// Tam Phuong Duong Nhoi - dung chung voi DEFAULT_CENTER trong
// NeighborhoodZonesMap.tsx (frontend). Du an chi trien khai cho 1 Phuong nen
// hardcode, khong can client truyen len.
const WARD_CENTER = { lat: 20.98, lng: 105.745 };

/**
 * POST /api/pois/scan
 * Quet xap xi tat ca danh muc "Điểm tiện ích" qua Goong Autocomplete (xem
 * poiService.scanPois) - CHI tao ban ghi moi (source="scan", verified=false),
 * KHONG BAO GIO tu dong sua/xoa ban ghi da co. Admin phai vao trang "Điểm
 * tiện ích" xem lai/xoa ket qua sai truoc khi tin - day chi la goi y ban dau.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "pois.manage");
        const results = await scanPois(String(user._id), WARD_CENTER);
        return apiSuccess(results, "Đã quét xong - vào danh sách để xem lại kết quả");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
