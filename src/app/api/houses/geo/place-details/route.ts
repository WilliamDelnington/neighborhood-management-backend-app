import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getPlaceDetails } from "@/lib/integrations/googleMaps";
import { geoPlaceDetailsSchema } from "@/validators/googleMapsGeo";

export const dynamic = "force-dynamic";

/**
 * POST /api/houses/geo/place-details
 * Phai truyen chung sessionToken voi lan goi /autocomplete tuong ung de
 * Google tinh phi ca chuoi nhu MOT session (xem googleMaps.ts).
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
