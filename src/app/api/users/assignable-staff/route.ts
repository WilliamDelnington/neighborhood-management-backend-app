import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission, getRoleKeysWithPermission } from "@/lib/rbac";
import { listAssignableStaff } from "@/services/userService";

export const dynamic = "force-dynamic";

/**
 * Danh sach rut gon nhan vien co the duoc gan phu trach phan anh - danh cho bat
 * ky vai tro nao dang duoc cap quyen complaints.assign (khong chi admin nhu
 * /api/users), tra ve toi thieu du lieu (id + displayName) de tranh lo thong
 * tin quan ly nguoi dung day du.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.assign");
        const roleKeys = await getRoleKeysWithPermission("complaints.assign");
        const staff = await listAssignableStaff(roleKeys);
        return apiSuccess(staff);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
