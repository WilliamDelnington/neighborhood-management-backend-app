import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import {
    getRoleById,
    updateRoleById,
    deleteRoleById,
} from "@/services/roleService";
import { updateRoleSchema } from "@/validators/role";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        const role = await getRoleById(params.id);
        return apiSuccess(role);
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
        requireRole(session, "admin");
        const body = updateRoleSchema.parse(await req.json());
        const role = await updateRoleById(session.userId, params.id, body);
        return apiSuccess(role, "Cap nhat vai tro thanh cong");
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
        requireRole(session, "admin");
        const result = await deleteRoleById(session.userId, params.id);
        return apiSuccess(result, "Xoa vai tro thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
