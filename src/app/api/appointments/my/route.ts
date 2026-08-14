import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { listMyAppointments } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/my?status=&page=&limit=
 * Lich hen cua chinh nguoi dang dang nhap - khop theo bookedByUserId HOAC
 * citizenUserId (nguoi tu dat va nguoi duoc to truong/to pho dat ho, neu co
 * tai khoan, deu thay duoc lich hen nay).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listMyAppointments(actorUser, {
            status: searchParams.get("status") || undefined,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
