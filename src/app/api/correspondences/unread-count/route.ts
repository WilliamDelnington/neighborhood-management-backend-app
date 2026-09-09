import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { getUnreadCountByRelatedModel } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

/**
 * GET /api/correspondences/unread-count
 * So thong bao van ban (Cong van/Bao cao/De xuat/Kien nghi...) CHUA DOC cua
 * nguoi dang nhap - dung cho badge so luong canh muc "Văn bản" tren menu.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const count = await getUnreadCountByRelatedModel(
            String(actorUser._id),
            "Correspondence",
        );
        return apiSuccess({ count });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
