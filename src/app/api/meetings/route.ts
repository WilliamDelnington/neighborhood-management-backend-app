import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createMeetingSchema } from "@/validators/meeting";

export const dynamic = "force-dynamic";
import { createMeeting, listMeetings } from "@/services/meetingService";

/**
 * GET cong khai: mac dinh chi tra ve cuoc hop da dang (publicOnly=true), khong yeu
 * cau dang nhap. Neu co query ?admin=1 va nguoi goi co quyen "meetings.read" (nhan
 * vien) thi tra ve ca cuoc hop nhap (chua published) de quan ly - giong het pattern
 * cua /api/announcements.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);

        let publicOnly = true;
        if (searchParams.get("admin") === "1") {
            const actorUser = await requireUser(req);
            await requirePermission(actorUser, "meetings.read");
            publicOnly = false;
        }

        const result = await listMeetings({
            page,
            limit,
            upcomingOnly: searchParams.get("upcomingOnly") === "1",
            publicOnly,
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
        await requirePermission(actorUser, "meetings.create");
        const body = createMeetingSchema.parse(await req.json());
        const meeting = await createMeeting(String(actorUser._id), body);
        return apiSuccess(meeting, "Tao cuoc hop thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
