import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { updateAnnouncementSchema } from "@/validators/announcement";

export const dynamic = "force-dynamic";
import {
    deleteAnnouncement,
    getAnnouncementById,
    updateAnnouncement,
} from "@/services/announcementService";

/**
 * GET cong khai: chi xem duoc thong bao da dang, tru khi nguoi goi la nhan vien
 * (admin/secretary/neighborhood_leader) thi duoc xem ca ban nhap.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        let isStaff = false;
        try {
            const actorUser = await requireUser(req);
            isStaff = await userHasPermission(actorUser, "announcements.read");
        } catch {
            isStaff = false;
        }
        const announcement = await getAnnouncementById(params.id, !isStaff);
        return apiSuccess(announcement);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "announcements.update");
        const body = updateAnnouncementSchema.parse(await req.json());
        const announcement = await updateAnnouncement(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(announcement, "Cap nhat thong bao thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "announcements.update");
        await deleteAnnouncement(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa thong bao thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
