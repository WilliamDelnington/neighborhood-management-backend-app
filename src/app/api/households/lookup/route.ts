import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { searchHouseholdsForOnboarding } from "@/services/householdService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        await requireUser(req);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await searchHouseholdsForOnboarding({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            cluster: searchParams.get("cluster") || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
