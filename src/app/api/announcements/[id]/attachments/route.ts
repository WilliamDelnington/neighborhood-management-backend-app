import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    listAnnouncementAttachments,
    uploadAnnouncementAttachment,
} from "@/services/announcementService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        await requireUser(req);
        const attachments = await listAnnouncementAttachments(params.id);
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "announcements.update");
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thieu file can tai len", 400);
        }
        const fileAsset = await uploadAnnouncementAttachment(
            actorUser,
            params.id,
            file,
        );
        return apiSuccess(fileAsset, "Tai len file dinh kem thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
