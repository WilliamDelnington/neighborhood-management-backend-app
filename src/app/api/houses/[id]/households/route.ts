import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import { listHouseholds } from "@/services/householdService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/:id/households
 * Danh sach ho dan thuoc mot nha so cu the, dung cho man chi tiet nha so o admin.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "households.read");

        const houseRecord = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(user, houseRecord);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listHouseholds({
            page,
            limit,
            houseId: params.id,
            search: searchParams.get("search") || undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
