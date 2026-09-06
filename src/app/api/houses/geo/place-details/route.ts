import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getPlaceDetails } from "@/lib/integrations/goong";
import { geoPlaceDetailsSchema } from "@/validators/housesGeo";

export const dynamic = "force-dynamic";

/**
 * POST /api/houses/geo/place-details
 * Nen truyen chung sessionToken voi lan goi /autocomplete tuong ung (xem
 * goong.ts) - Goong khong tinh phi theo session nhu Google truoc day, nhung
 * van giu de khong phai doi hop dong API voi client.
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
        const input = geoPlaceDetailsSchema.parse(await req.json());
        const details = await getPlaceDetails(
            input.placeId,
            input.sessionToken,
        );
        return apiSuccess(details);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
