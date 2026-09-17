import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getUserNeighborhoodManagementHistory } from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/:id/management-history
 * Lich su dam nhiem To truong/To pho/Cong tac vien cua MOT nguoi dung, xuyen
 * suot moi to dan pho - hien thi tren ho so Nguoi dung (UserDetailPage.tsx).
 * Gate bang neighborhoods.read (khong phai users.read/assertUserInLeaderScope
 * nhu getUserById) vi day la thong tin to chuc/cong khai trong noi bo (ai xem
 * duoc chi tiet mot To dan pho thi cung xem duoc ai tung phu trach To do),
 * khong phai du lieu ca nhan can gioi han theo pham vi chu nha.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "neighborhoods.read");

        const history = await getUserNeighborhoodManagementHistory(params.id);
        return apiSuccess(history);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
