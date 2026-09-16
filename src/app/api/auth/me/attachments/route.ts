import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { listAttachments } from "@/services/attachmentService";
import { uploadUserAttachment } from "@/services/userService";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me/attachments
 * Danh sach tai lieu dinh kem ("Giấy tờ") cua CHINH nguoi dang dang nhap -
 * khac /api/users/:id/attachments (can users.read, danh cho admin xem nguoi
 * khac), endpoint nay khong doi quyen gi ngoai dang nhap.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const attachments = await listAttachments("User", String(actorUser._id));
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
 * POST /api/auth/me/attachments
 * Tai len tai lieu dinh kem moi cho ho so cua chinh minh.
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
        const fileAsset = await uploadUserAttachment(actorId, actorId, file);
        return apiSuccess(fileAsset, "Tải lên tài liệu thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
