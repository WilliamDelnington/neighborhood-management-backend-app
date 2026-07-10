import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { listMyNotifications } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const unreadOnly = searchParams.get("unreadOnly") === "true";

        const result = await listMyNotifications(String(actorUser._id), {
            page,
            limit,
            unreadOnly,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
