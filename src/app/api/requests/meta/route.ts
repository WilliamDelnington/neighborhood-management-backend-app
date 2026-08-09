import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { getRequestMeta } from "@/services/requestService";

export const dynamic = "force-dynamic";

/**
 * GET /api/requests/meta
 * Danh sach loai yeu cau nguoi dung hien tai duoc phep gui, va vai tro du dieu
 * kien nhan cho tung loai - dung de dung form tao yeu cau o admin.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "requests.create");
        const meta = await getRequestMeta(actorUser);
        return apiSuccess(meta);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
