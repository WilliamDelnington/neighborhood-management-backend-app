import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { createMeetingSchema } from "@/validators/meeting";

export const dynamic = "force-dynamic";
import {
    createMeeting,
    listMeetings,
    STAFF_ROLES_FOR_MEETINGS,
} from "@/services/meetingService";

export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listMeetings({
            page,
            limit,
            upcomingOnly: searchParams.get("upcomingOnly") === "1",
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, ...STAFF_ROLES_FOR_MEETINGS);
        const body = createMeetingSchema.parse(await req.json());
        const meeting = await createMeeting(String(actorUser._id), body);
        return apiSuccess(meeting, "Tao cuoc hop thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
