import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { listUsers } from "@/services/userService";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const search = searchParams.get("search") || undefined;
        const role = (searchParams.get("role") as Role | null) || undefined;

        const result = await listUsers({
            page,
            limit,
            search,
            role: role || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
