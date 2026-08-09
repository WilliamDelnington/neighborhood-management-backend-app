import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createHouseOwnerByStaff, listUsers } from "@/services/userService";
import { createHouseOwnerSchema } from "@/validators/user";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.create");

        const body = createHouseOwnerSchema.parse(await req.json());
        const user = await createHouseOwnerByStaff(actorUser, body);
        return apiSuccess(user, "Tao tai khoan chu ho thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const search = searchParams.get("search") || undefined;
        const role = (searchParams.get("role") as Role | null) || undefined;

        const result = await listUsers({
            page,
            limit,
            search,
            role: role || undefined,
            actorUser,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
