import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { updateAnnouncementSchema } from "@/validators/announcement";

export const dynamic = "force-dynamic";
import {
    deleteAnnouncement,
    getAnnouncementById,
    STAFF_ROLES_FOR_ANNOUNCEMENTS,
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
            const session = requireSession(req);
            isStaff = session.roles.some(r =>
                (STAFF_ROLES_FOR_ANNOUNCEMENTS as readonly string[]).includes(
                    r,
                ),
            );
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
        const session = requireSession(req);
        requireRole(session, ...STAFF_ROLES_FOR_ANNOUNCEMENTS);
        const body = updateAnnouncementSchema.parse(await req.json());
        const announcement = await updateAnnouncement(
            session.userId,
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
        const session = requireSession(req);
        requireRole(session, ...STAFF_ROLES_FOR_ANNOUNCEMENTS);
        await deleteAnnouncement(session.userId, params.id);
        return apiSuccess(null, "Xoa thong bao thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
