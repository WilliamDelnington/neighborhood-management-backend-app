import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { countMyPendingRequests } from "@/services/requestService";

export const dynamic = "force-dynamic";

/**
 * GET /api/requests/my/pending-count
 * So yeu cau cong viec dang duoc GIAO cho nguoi dang nhap ma CHUA hoan thanh -
 * dung cho badge so luong canh muc "Yêu cầu công việc" tren menu, cung quy uoc
 * voi /api/correspondences/unread-count.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const count = await countMyPendingRequests(String(actorUser._id));
        return apiSuccess({ count });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
