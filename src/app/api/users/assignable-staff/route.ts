import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { listAssignableStaff } from "@/services/userService";
import { STAFF_ROLES_FOR_COMPLAINTS } from "@/services/complaintService";

export const dynamic = "force-dynamic";

/**
 * Danh sach rut gon nhan vien co the duoc gan phu trach phan anh - danh cho ca 4
 * vai tro duoc phep gan phu trach (khong chi admin nhu /api/users), tra ve toi thieu
 * du lieu (id + displayName) de tranh lo thong tin quan ly nguoi dung day du.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, ...STAFF_ROLES_FOR_COMPLAINTS);
        const staff = await listAssignableStaff([
            ...STAFF_ROLES_FOR_COMPLAINTS,
        ]);
        return apiSuccess(staff);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
