import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { updateCitizenSchema } from "@/validators/citizen";

export const dynamic = "force-dynamic";
import {
    getCitizenById,
    updateCitizen,
    deleteCitizen,
    CITIZEN_READ_ROLES,
    CITIZEN_WRITE_ROLES,
} from "@/services/citizenService";
import {
    assertHouseholdInScope,
    getHouseholdById,
} from "@/services/householdService";
import type { IHousehold, IUser } from "@/models";

/**
 * Kiem tra quyen truy cap nhan khau dua tren cum dan cu cua ho khau chua nhan khau do.
 * householdId co the da duoc populate (object) hoac chi la ObjectId tuy noi goi.
 */
async function assertCitizenInScope(
    user: IUser,
    citizen: { householdId: unknown },
): Promise<void> {
    if (user.roles.includes("admin")) return;
    const household = citizen.householdId as IHousehold;
    const resolvedHousehold =
        household && typeof household === "object" && "cluster" in household
            ? household
            : await getHouseholdById(String(citizen.householdId));
    assertHouseholdInScope(user, resolvedHousehold);
}

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, ...CITIZEN_READ_ROLES);

        const citizen = await getCitizenById(params.id);
        await assertCitizenInScope(user, citizen);

        return apiSuccess(citizen);
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
        requireRole(user, ...CITIZEN_WRITE_ROLES);

        const existing = await getCitizenById(params.id);
        await assertCitizenInScope(user, existing);

        const body = updateCitizenSchema.parse(await req.json());
        const citizen = await updateCitizen(String(user._id), params.id, body);
        return apiSuccess(citizen, "Cap nhat nhan khau thanh cong");
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
        requireRole(user, ...CITIZEN_WRITE_ROLES);

        const existing = await getCitizenById(params.id);
        await assertCitizenInScope(user, existing);

        await deleteCitizen(String(user._id), params.id);
        return apiSuccess(null, "Xoa nhan khau thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
