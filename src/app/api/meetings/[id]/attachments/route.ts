import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    listMeetingAttachments,
    uploadMeetingAttachment,
} from "@/services/meetingService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        await requireUser(req);
        const attachments = await listMeetingAttachments(params.id);
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
        await requirePermission(actorUser, "meetings.update");
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thieu file can tai len", 400);
        }
        const fileAsset = await uploadMeetingAttachment(
            actorUser,
            params.id,
            file,
        );
        return apiSuccess(fileAsset, "Tải lên file đính kèm thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
