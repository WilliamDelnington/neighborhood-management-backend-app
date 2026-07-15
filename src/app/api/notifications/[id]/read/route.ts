import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { markAsRead } from "@/services/notificationReadService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const delivery = await markAsRead(String(actorUser._id), params.id);
        return apiSuccess(delivery, "Da danh dau thong bao la da doc");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
