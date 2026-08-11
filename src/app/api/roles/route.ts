import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createRoleSchema } from "@/validators/role";
import { createRole, listRoles } from "@/services/roleService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "roles.read");

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || undefined;
        const activeParam = searchParams.get("active");
        const active =
            activeParam === null
                ? undefined
                : activeParam === "1" || activeParam === "true";
        const { page, limit } = paginationParams(searchParams);

        const roles = await listRoles({ search, active, page, limit });
        return apiSuccess(roles);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "roles.create");

        const body = createRoleSchema.parse(await req.json());
        // Tao role co permission la mot thao tac phan quyen, khong chi la tao
        // metadata. Chan nguoi chi co roles.create tu tu cap/quang ba quyen cao
        // hon thong qua mot role moi.
        if (body.permissions.length > 0) {
            await requirePermission(actorUser, "roles.manage");
        }
        const role = await createRole(String(actorUser._id), body);
        return apiSuccess(role, "Tạo vai trò thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
