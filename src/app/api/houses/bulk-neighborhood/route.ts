import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { bulkAssignHouseNeighborhoodSchema } from "@/validators/houseRecord";
import { bulkAssignHouseNeighborhood } from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/houses/bulk-neighborhood
 * Gan mot to dan pho cho nhieu nha so cung luc, chon tu man "Danh sach nha
 * so" (vd cac nha nhap tu Excel con thieu to dan pho). Cung quyen voi
 * PATCH /api/houses/:id (houses.update) - moi nha duoc xu ly rieng, xem
 * bulkAssignHouseNeighborhood o service.
 */
export async function PATCH(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.update");

        const body = bulkAssignHouseNeighborhoodSchema.parse(await req.json());
        const result = await bulkAssignHouseNeighborhood(
            user,
            body.ids,
            body.neighborhoodId,
        );
        return apiSuccess(
            result,
            `Đã gán tổ dân phố cho ${result.succeededIds.length}/${body.ids.length} nhà số`,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
