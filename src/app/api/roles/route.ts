import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { listRoles, createRole } from "@/services/roleService";
import { createRoleSchema } from "@/validators/role";

export const dynamic = "force-dynamic";

/**
 * GET /api/roles?search=&active=&page=&limit=
 * POST /api/roles - tao vai tro tuy chinh moi
 *
 * LUU Y ROUTING: cac segment tinh "permissions", "assign", "revoke" duoi /api/roles
 * duoc uu tien hon route dong "[id]" (giong quy uoc households/lookup).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const search = searchParams.get("search") || undefined;
        const activeParam = searchParams.get("active");
        const active =
            activeParam === null ? undefined : activeParam === "true";

        const result = await listRoles({ page, limit, search, active });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");

        const body = createRoleSchema.parse(await req.json());
        const role = await createRole(session.userId, body);
        return apiSuccess(role, "Tao vai tro thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
