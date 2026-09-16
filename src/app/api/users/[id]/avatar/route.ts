import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { uploadUserAvatar } from "@/services/userService";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/:id/avatar
 * Tai len/thay anh dai dien cho ho so nguoi dung - upload truc tiep tu
 * admin-web-app (xem ghi chu o userService.uploadUserAvatar).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.update");

        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thiếu file cần tải lên", 400);
        }

        const user = await uploadUserAvatar(
            String(actorUser._id),
            params.id,
            file,
        );
        return apiSuccess(user, "Tải lên ảnh đại diện thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
