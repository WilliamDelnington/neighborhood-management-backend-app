import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { autocompletePlaces } from "@/lib/integrations/googleMaps";
import { geoAutocompleteSchema } from "@/validators/googleMapsGeo";

export const dynamic = "force-dynamic";

/**
 * POST /api/houses/geo/autocomplete
 * Proxy Places Autocomplete (New) - khoa API luon o server, khong tra ve
 * client. Gioi han quyen theo dung nhom duoc phep tao/sua nha so (khong mo
 * cho nguoi chi co houses.read) de tranh bi lam dung goi Google ton phi.
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
