import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { listAttachments } from "@/services/attachmentService";
import { uploadUserAttachment } from "@/services/userService";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/:id/attachments
 * Danh sach tai lieu dinh kem cua ho so nguoi dung.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "users.read");

        const attachments = await listAttachments("User", params.id);
        const origin = getPublicOrigin(req);
        attachments.forEach(a => {
            a.url = toAbsoluteUploadUrl(a.url, origin);
        });
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * POST /api/users/:id/attachments
 * Tai len tai lieu dinh kem moi - upload truc tiep tu admin-web-app (xem ghi
 * chu o userService.uploadUserAttachment).
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

        const fileAsset = await uploadUserAttachment(
            String(actorUser._id),
            params.id,
            file,
        );
        return apiSuccess(fileAsset, "Tải lên tài liệu thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
