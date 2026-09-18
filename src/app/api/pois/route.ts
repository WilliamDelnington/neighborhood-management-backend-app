import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { POI_CATEGORIES, type PoiCategory } from "@/models/Poi";
import { createPoiSchema } from "@/validators/poi";
import { createPoi, listPois } from "@/services/poiService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "pois.read");

        const { searchParams } = new URL(req.url);
        const categoryParam = searchParams.get("category") || undefined;
        const category =
            categoryParam &&
            (POI_CATEGORIES as readonly string[]).includes(categoryParam)
                ? (categoryParam as PoiCategory)
                : undefined;
        const verifiedParam = searchParams.get("verified");
        const verified = verifiedParam === null ? undefined : verifiedParam === "true";

        const items = await listPois({ category, verified });
        return apiSuccess(items);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "pois.manage");

        const body = createPoiSchema.parse(await req.json());
        const poi = await createPoi(String(user._id), body);
        return apiSuccess(poi, "Tạo điểm tiện ích thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
