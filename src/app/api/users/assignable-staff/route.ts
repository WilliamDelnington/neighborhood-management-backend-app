import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission, getRoleKeysWithPermission } from "@/lib/rbac";
import { isValidPermissionKey } from "@/lib/permissionRegistry";
import { listAssignableStaff } from "@/services/userService";

export const dynamic = "force-dynamic";

/**
 * Danh sach rut gon nhan vien co the duoc gan phu trach mot loai viec (phan anh,
 * PCCC, ...) - danh cho bat ky vai tro nao dang duoc cap quyen "assign" tuong
 * ung (khong chi admin nhu /api/users), tra ve toi thieu du lieu (id +
 * displayName) de tranh lo thong tin quan ly nguoi dung day du. Permission
 * dung de tra cuu duoc truyen qua ?permission=, mac dinh complaints.assign de
 * tuong thich voi cac noi da goi endpoint nay truoc khi co tham so nay.
 *
 * ?roles=a,b,c la duong thay the: tra ve thang theo danh sach vai tro cu the
 * thay vi suy tu mot permission - dung khi ben goi da biet chinh xac tap vai
 * tro hop le (vd CorrespondenceType.allowedReceiverRoles), vi correspondences.*
 * la permission chung cho CA HAI chieu gui/nhan nen khong con dai dien cho
 * "ai duoc nhan LOAI VAN BAN NAY" nhu truoc (xem correspondenceService.ts).
 * Chi doi hoi actorUser dang dang nhap (khong gioi han permission rieng) vi
 * chinh CorrespondenceType da la du lieu cong khai cho nguoi dang soan.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const { searchParams } = new URL(req.url);
        const rolesParam = searchParams.get("roles");

        if (rolesParam) {
            const roleKeys = rolesParam
                .split(",")
                .map(v => v.trim())
                .filter(Boolean);
            const staff = await listAssignableStaff(roleKeys);
            return apiSuccess(staff);
        }

        const permission = searchParams.get("permission") || "complaints.assign";
        if (!isValidPermissionKey(permission)) {
            throw new HttpError("Permission khong hop le", 400);
        }
        await requirePermission(actorUser, permission);
        const roleKeys = await getRoleKeysWithPermission(permission);
        const staff = await listAssignableStaff(roleKeys);
        return apiSuccess(staff);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
