import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { registerMeetingSchema } from "@/validators/meeting";

export const dynamic = "force-dynamic";
import {
    listRegistrationsForMeeting,
    registerForMeeting,
} from "@/services/meetingService";

/**
 * Bat ky nguoi dung dang nhap nao cung co the dang ky/cap nhat dang ky tham du
 * cuoc hop cua chinh minh (upsert theo meetingId + userId).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = registerMeetingSchema.parse(await req.json());
        const registration = await registerForMeeting(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(registration, "Dang ky tham du thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * Chi nhan vien duoc xem danh sach dang ky tham du (phuc vu diem danh).
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "meetings.read");
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listRegistrationsForMeeting(params.id, {
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
