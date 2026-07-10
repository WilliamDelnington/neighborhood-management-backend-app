import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { createHouseholdSchema } from "@/validators/household";

export const dynamic = "force-dynamic";
import {
    createHousehold,
    listHouseholds,
    HOUSEHOLD_READ_ROLES,
    HOUSEHOLD_WRITE_ROLES,
} from "@/services/householdService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, ...HOUSEHOLD_WRITE_ROLES);

        const body = createHouseholdSchema.parse(await req.json());
        const household = await createHousehold(String(user._id), body);
        return apiSuccess(household, "Tao ho dan thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, ...HOUSEHOLD_READ_ROLES);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listHouseholds({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            cluster: searchParams.get("cluster") || undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
