import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getPlaceDetails } from "@/lib/integrations/goong";
import { geoPlaceDetailsSchema } from "@/validators/housesGeo";

export const dynamic = "force-dynamic";

/**
 * POST /api/neighborhoods/geo/place-details
 * Xem ghi chu trong route autocomplete cung thu muc - cap cho ban do ranh
 * gioi To dan pho o Dashboard, gioi han theo neighborhoods.read.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "neighborhoods.read");
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
