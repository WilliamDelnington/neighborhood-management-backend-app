import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getInspectionCreationOptions } from "@/services/inspectionService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const rawIds = new URL(req.url).searchParams.get("neighborhoodIds");
        const neighborhoodIds = rawIds
            ? rawIds.split(",").map(value => value.trim()).filter(Boolean)
            : [];
        return apiSuccess(
            await getInspectionCreationOptions(actorUser, neighborhoodIds),
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
