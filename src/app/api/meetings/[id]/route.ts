import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { updateMeetingSchema } from "@/validators/meeting";

export const dynamic = "force-dynamic";
import {
    deleteMeeting,
    getMeetingById,
    updateMeeting,
} from "@/services/meetingService";

/**
 * GET cong khai: chi xem duoc cuoc hop da dang, tru khi nguoi goi co quyen
 * "meetings.read" (nhan vien) thi duoc xem ca ban nhap - giong pattern cua
 * /api/announcements/[id].
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
            isStaff = await userHasPermission(actorUser, "meetings.read");
        } catch {
            isStaff = false;
        }
        const meeting = await getMeetingById(params.id, !isStaff);
        return apiSuccess(meeting);
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
        await requirePermission(actorUser, "meetings.update");
        const body = updateMeetingSchema.parse(await req.json());
        const meeting = await updateMeeting(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(meeting, "Cap nhat cuoc hop thanh cong");
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
        await requirePermission(actorUser, "meetings.update");
        await deleteMeeting(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa cuoc hop thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
