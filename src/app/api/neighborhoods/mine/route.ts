import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { Neighborhood, HouseRecord } from "@/models";
import { getHouseIdsForActingOwner } from "@/services/houseOwnershipService";
import { listColeaders } from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

/**
 * GET /api/neighborhoods/mine
 * Thong tin to dan pho cong khai (C03) cho Nha so - khac /api/neighborhoods/[id]
 * (yeu cau neighborhoods.read, danh cho nhan vien). To dan pho suy tu nha ma
 * nguoi dang dang nhap dang thao tac thay chu (giong app/api/houses/mine),
 * chi tra ve cac truong an toan de cong khai (khong co danh sach nha/ho dan
 * thuoc to).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);

        const houseIds = await getHouseIdsForActingOwner(user._id);
        if (houseIds.length === 0) return apiSuccess([]);

        const houses = await HouseRecord.find({
            _id: { $in: houseIds },
        }).select("neighborhoodId");
        const neighborhoodIds = Array.from(
            new Set(
                houses
                    .map(h => h.neighborhoodId)
                    .filter(Boolean)
                    .map(String),
            ),
        );
        if (neighborhoodIds.length === 0) return apiSuccess([]);

        const neighborhoods = await Neighborhood.find({
            _id: { $in: neighborhoodIds },
        })
            .select("name address description contactPhone leaderUserId")
            .populate("leaderUserId", "displayName phone");

        const items = await Promise.all(
            neighborhoods.map(async neighborhood => ({
                neighborhood,
                coleaders: await listColeaders(String(neighborhood._id)),
            })),
        );

        return apiSuccess(items);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
