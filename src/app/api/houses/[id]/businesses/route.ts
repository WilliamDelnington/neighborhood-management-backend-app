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
import { listBusinesses } from "@/services/businessService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/:id/businesses
 * Danh sach ho kinh doanh thuoc mot nha so cu the, dung cho man chi tiet nha so o admin.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "businesses.read");

        const houseRecord = await getHouseRecordById(params.id);
        assertHouseRecordInScope(user, houseRecord);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listBusinesses({ houseId: params.id, page, limit });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
