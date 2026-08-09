import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateHouseUsageUnitSchema } from "@/validators/houseUsageUnit";
import {
    getHouseUsageUnitById,
    updateHouseUsageUnit,
    deleteHouseUsageUnit,
} from "@/services/houseUsageUnitService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "usage_units.read");

        const unit = await getHouseUsageUnitById(params.id);
        return apiSuccess(unit);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "usage_units.update");

        const body = updateHouseUsageUnitSchema.parse(await req.json());
        const unit = await updateHouseUsageUnit(user, params.id, body);
        return apiSuccess(unit, "Cap nhat don vi su dung thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "usage_units.delete");

        await deleteHouseUsageUnit(user, params.id);
        return apiSuccess(null, "Xoa don vi su dung thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
