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
import { listCompanies } from "@/services/companyService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/:id/companies
 * Danh sach cong ty thuoc mot nha so cu the, dung cho man chi tiet nha so o
 * admin - mirror GET /api/houses/:id/businesses.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "companies.read");

        const houseRecord = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(user, houseRecord);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listCompanies({ houseId: params.id, page, limit });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
