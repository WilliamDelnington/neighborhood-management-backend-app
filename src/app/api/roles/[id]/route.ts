import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateRoleSchema } from "@/validators/role";
import { deleteRole, getRoleById, updateRole } from "@/services/roleService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "roles.read");

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
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "roles.update");

        const body = updateRoleSchema.parse(await req.json());
        // roles.update cho phep sua metadata/pham vi cua role. Thay doi tap
        // permission co the dung de tu nang quyen nen bat buoc co roles.manage.
        if (body.permissions !== undefined) {
            await requirePermission(actorUser, "roles.manage");
        }
        const role = await updateRole(String(actorUser._id), params.id, body);
        return apiSuccess(role, "Cập nhật vai trò thành công");
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
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "roles.delete");

        const result = await deleteRole(String(actorUser._id), params.id);
        return apiSuccess(result, "Xóa vai trò thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
