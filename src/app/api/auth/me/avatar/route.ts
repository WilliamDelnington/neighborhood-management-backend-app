import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { uploadUserAvatar } from "@/services/userService";
import { sanitizeUserWithPermissions } from "@/services/authService";
import { User } from "@/models";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/me/avatar
 * Tai len/thay anh dai dien cua CHINH nguoi dang dang nhap - khong doi quyen
 * gi (khac /api/users/:id/avatar can users.update, danh cho admin sua nguoi
 * khac). Dung chung uploadUserAvatar voi actorId=targetId=chinh minh.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thiếu file cần tải lên", 400);
        }

        const actorId = String(actorUser._id);
        await uploadUserAvatar(actorId, actorId, file);

        const updated = await User.findById(actorId);
        if (!updated) throw new HttpError("Không tìm thấy tài khoản", 404);
        return apiSuccess(
            await sanitizeUserWithPermissions(updated),
            "Tải lên ảnh đại diện thành công",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
