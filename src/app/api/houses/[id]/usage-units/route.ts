import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createHouseUsageUnitSchema } from "@/validators/houseUsageUnit";
import {
    createHouseUsageUnit,
    listHouseUsageUnitsByHouse,
} from "@/services/houseUsageUnitService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/:id/usage-units
 * Danh sach don vi su dung (HouseUsageUnit) cua mot nha so cu the.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "usage_units.read");

        const items = await listHouseUsageUnitsByHouse(user, params.id);
        return apiSuccess(items);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * POST /api/houses/:id/usage-units
 * Tao don vi su dung moi, gan mot Household/Business/Company DA CO SAN duoi
 * nha nay vao mot don vi (vd tang/phong) - xem houseUsageUnitService.ts.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "usage_units.create");

        const body = createHouseUsageUnitSchema.parse({
            ...(await req.json()),
            houseId: params.id,
        });
        const unit = await createHouseUsageUnit(user, body);
        return apiSuccess(unit, "Tao don vi su dung thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
