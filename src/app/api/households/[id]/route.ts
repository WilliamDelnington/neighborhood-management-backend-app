import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole, requireUser } from "@/lib/rbac";
import { updateHouseholdSchema } from "@/validators/household";

export const dynamic = "force-dynamic";
import {
    getHouseholdById,
    updateHousehold,
    deleteHousehold,
    assertHouseholdInScope,
    HOUSEHOLD_READ_ROLES,
    HOUSEHOLD_WRITE_ROLES,
} from "@/services/householdService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...HOUSEHOLD_READ_ROLES);
        const user = await requireUser(req);

        const household = await getHouseholdById(params.id);
        assertHouseholdInScope(user, household);

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
        const session = requireSession(req);
        requireRole(session, ...HOUSEHOLD_WRITE_ROLES);
        const user = await requireUser(req);

        const existing = await getHouseholdById(params.id);
        assertHouseholdInScope(user, existing);

        const body = updateHouseholdSchema.parse(await req.json());
        const household = await updateHousehold(
            String(user._id),
            params.id,
            body,
        );
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
        const session = requireSession(req);
        requireRole(session, ...HOUSEHOLD_WRITE_ROLES);
        const user = await requireUser(req);

        const existing = await getHouseholdById(params.id);
        assertHouseholdInScope(user, existing);

        await deleteHousehold(String(user._id), params.id);
        return apiSuccess(null, "Xoa ho dan thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
