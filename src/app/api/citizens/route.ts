import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { createCitizenSchema } from "@/validators/citizen";

export const dynamic = "force-dynamic";
import {
    createCitizen,
    listCitizens,
    CITIZEN_READ_ROLES,
    CITIZEN_WRITE_ROLES,
} from "@/services/citizenService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, ...CITIZEN_WRITE_ROLES);

        const body = createCitizenSchema.parse(await req.json());
        const citizen = await createCitizen(String(user._id), body);
        return apiSuccess(citizen, "Them nhan khau thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, ...CITIZEN_READ_ROLES);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listCitizens({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            householdId: searchParams.get("householdId") || undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
