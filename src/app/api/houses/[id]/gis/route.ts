import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { updateHouseRecordGis } from "@/services/houseRecordService";
import { updateHouseRecordGisSchema } from "@/validators/houseRecord";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/houses/:id/gis
 * Endpoint hep cho thiet bi di dong/can bo thuc dia. Khong mo quyen sua cac
 * truong ho so khac va van kiem tra pham vi Nha so trong service.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "houses.update_gis");
        const input = updateHouseRecordGisSchema.parse(await req.json());
        const house = await updateHouseRecordGis(actorUser, params.id, input);
        return apiSuccess(house, "Cap nhat toa do GIS thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
