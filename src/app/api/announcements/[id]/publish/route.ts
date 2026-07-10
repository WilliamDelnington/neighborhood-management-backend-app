import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import {
    publishAnnouncement,
    STAFF_ROLES_FOR_ANNOUNCEMENTS,
} from "@/services/announcementService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, ...STAFF_ROLES_FOR_ANNOUNCEMENTS);
        const announcement = await publishAnnouncement(
            String(actorUser._id),
            params.id,
        );
        return apiSuccess(announcement, "Dang thong bao thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
