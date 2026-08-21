import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { markAllAsRead } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const result = await markAllAsRead(String(actorUser._id));
        return apiSuccess(result, "Đã đánh dấu toàn bộ thông báo là đã đọc");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
