import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession } from "@/lib/rbac";
import { markAsRead } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        const delivery = await markAsRead(session.userId, params.id);
        return apiSuccess(delivery, "Da danh dau thong bao la da doc");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
