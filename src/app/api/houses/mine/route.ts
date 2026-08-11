import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { HouseRecord } from "@/models";
import {
    getHouseIdsForActingOwner,
    listHouseOwnerships,
} from "@/services/houseOwnershipService";
import { listHouseUsageUnitsByHouse } from "@/services/houseUsageUnitService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/mine
 * "Nha cua toi" cho nguoi dan - khac /api/houses/[id] (yeu cau houses.read,
 * danh cho nhan vien): o day quyen xem duoc suy ra tu chinh quan he so huu
 * dang thao tac thay (getHouseIdsForActingOwner), khong can permission rieng.
 * Tra ve mang rong (mot nguoi co the dung ten/dai dien cho nhieu nha).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);

        const houseIds = await getHouseIdsForActingOwner(user._id);
        if (houseIds.length === 0) return apiSuccess([]);

        const houses = await HouseRecord.find({ _id: { $in: houseIds } })
            .populate("neighborhoodId", "name address contactPhone")
            .populate("streetId", "name");

        const items = await Promise.all(
            houses.map(async house => {
                const [ownerships, usageUnits] = await Promise.all([
                    listHouseOwnerships(String(house._id)),
                    listHouseUsageUnitsByHouse(user, String(house._id)),
                ]);
                return { house, ownerships, usageUnits };
            }),
        );

        return apiSuccess(items);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
