import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { listCitizens } from "@/services/citizenService";

export const dynamic = "force-dynamic";

/**
 * GET /api/households/:id/citizens
 * Danh sach nhan khau thuoc mot ho dan cu the, dung cho man chi tiet ho dan o admin.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "citizens.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listCitizens({
            page,
            limit,
            householdId: params.id,
            search: searchParams.get("search") || undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
