import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateHouseholdSchema } from "@/validators/household";

export const dynamic = "force-dynamic";
import {
    getHouseholdById,
    updateHousehold,
    deleteHousehold,
    assertHouseholdInScope,
} from "@/services/householdService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "households.read");

        const household = await getHouseholdById(params.id);
        await assertHouseholdInScope(user, household);

        return apiSuccess(household);
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
        await requirePermission(user, "households.update");

        const existing = await getHouseholdById(params.id);
        await assertHouseholdInScope(user, existing);

        const body = updateHouseholdSchema.parse(await req.json());
        const household = await updateHousehold(user, params.id, body);
        return apiSuccess(household, "Cap nhat ho dan thanh cong");
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
        await requirePermission(user, "households.delete");

        const existing = await getHouseholdById(params.id);
        await assertHouseholdInScope(user, existing);

        await deleteHousehold(String(user._id), params.id);
        return apiSuccess(null, "Xoa ho dan thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
