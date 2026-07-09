import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession } from "@/lib/rbac";
import { markAllAsRead } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        const result = await markAllAsRead(session.userId);
        return apiSuccess(result, "Da danh dau toan bo thong bao la da doc");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
