import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createNeighborhoodSchema } from "@/validators/neighborhood";
import {
    createNeighborhood,
    listNeighborhoods,
} from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const activeParam = searchParams.get("active");
        const result = await listNeighborhoods({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            active: activeParam === null ? undefined : activeParam === "true",
            leaderUserId: searchParams.get("leaderUserId") || undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");

        const body = createNeighborhoodSchema.parse(await req.json());
        const neighborhood = await createNeighborhood(String(user._id), body);
        return apiSuccess(neighborhood, "Tao to dan pho thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
