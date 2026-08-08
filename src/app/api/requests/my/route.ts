import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { listMyRequests } from "@/services/requestService";

export const dynamic = "force-dynamic";

/**
 * GET /api/requests/my
 * Hop thu yeu cau cua nguoi dang dang nhap - khong gioi han permission rieng,
 * bat ky ai cung xem duoc cac yeu cau ma minh la nguoi nhan.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listMyRequests(String(actorUser._id), {
            page,
            limit,
            status: searchParams.get("status") || undefined,
            type: searchParams.get("type") || undefined,
            overdueOnly: searchParams.get("overdueOnly") === "true",
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
