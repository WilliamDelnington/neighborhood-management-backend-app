import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { getUnreadCount } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const result = await getUnreadCount(String(actorUser._id));
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
