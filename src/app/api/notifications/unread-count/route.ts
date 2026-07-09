import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession } from "@/lib/rbac";
import { getUnreadCount } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        const result = await getUnreadCount(session.userId);
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
