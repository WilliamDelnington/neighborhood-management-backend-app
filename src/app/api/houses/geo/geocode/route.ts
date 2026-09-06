import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { geocodeAddress } from "@/lib/integrations/goong";
import { geoGeocodeSchema } from "@/validators/housesGeo";

export const dynamic = "force-dynamic";

/**
 * POST /api/houses/geo/geocode
 * Geocode mot lan cho dia chi DAY DU (so nha + duong + phuong/xa + tinh) -
 * dung khi client da tu ghep du cac thanh phan dia chi (xem HouseForm.tsx),
 * khong can nguoi dung go tim va chon tu danh sach goi y nhu
 * /autocomplete + /place-details.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requireAnyPermission(actorUser, [
            "houses.create",
            "houses.update",
            "houses.update_gis",
        ]);
        const input = geoGeocodeSchema.parse(await req.json());
        const details = await geocodeAddress(input.address);
        return apiSuccess(details);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
