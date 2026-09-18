import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { searchPlacesByCategory } from "@/lib/integrations/goong";
import { categoryPlaceSearchSchema } from "@/validators/placeSearch";

export const dynamic = "force-dynamic";

/**
 * POST /api/neighborhoods/geo/category-search
 * Xap xi "ban do tien ich" (UBND/Công an/Trường học/Chung cư...) tren widget
 * ban do o Dashboard - xem ghi chu chi tiet trong
 * lib/integrations/goong.ts (searchPlacesByCategory) ve gioi han chat luong
 * so voi tim theo danh muc that. Cung permission voi autocomplete/place-details
 * (neighborhoods.read) - khong phai thao tac sua du lieu.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "neighborhoods.read");
        const input = categoryPlaceSearchSchema.parse(await req.json());
        const results = await searchPlacesByCategory(
            input.keyword,
            { lat: input.lat, lng: input.lng },
            input.bounds,
        );
        return apiSuccess(results);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
