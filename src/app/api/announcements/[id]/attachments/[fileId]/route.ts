import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { deleteAnnouncementAttachment } from "@/services/announcementService";

export const dynamic = "force-dynamic";

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "announcements.update");
        await deleteAnnouncementAttachment(
            actorUser,
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xoa file dinh kem thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
