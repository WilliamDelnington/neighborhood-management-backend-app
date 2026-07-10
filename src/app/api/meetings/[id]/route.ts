import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { updateMeetingSchema } from "@/validators/meeting";

export const dynamic = "force-dynamic";
import {
    deleteMeeting,
    getMeetingById,
    STAFF_ROLES_FOR_MEETINGS,
    updateMeeting,
} from "@/services/meetingService";

export async function GET(
    _req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const meeting = await getMeetingById(params.id);
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
        requireRole(actorUser, ...STAFF_ROLES_FOR_MEETINGS);
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
        requireRole(actorUser, ...STAFF_ROLES_FOR_MEETINGS);
        await deleteMeeting(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa cuoc hop thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
