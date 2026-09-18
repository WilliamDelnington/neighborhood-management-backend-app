import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { autocompletePlaces } from "@/lib/integrations/goong";
import { geoAutocompleteSchema } from "@/validators/housesGeo";

export const dynamic = "force-dynamic";

/**
 * POST /api/neighborhoods/geo/autocomplete
 * Proxy Place Autocomplete cua Goong (xem lib/integrations/goong.ts) cho o
 * tim kiem dia chi tren ban do ranh gioi To dan pho o Dashboard
 * (NeighborhoodZonesMap.tsx) - khac /api/houses/geo/autocomplete (gioi han
 * quyen tao/sua Nha so), route nay chi can neighborhoods.read vi widget ban
 * do hien voi nhieu vai tro xem Dashboard, khong rieng nguoi quan ly Nha so.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "neighborhoods.read");
        const input = geoAutocompleteSchema.parse(await req.json());
        const predictions = await autocompletePlaces(
            input.input,
            input.sessionToken,
        );
        return apiSuccess(predictions);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
