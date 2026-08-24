import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { cancelChangeRequest } from "@/services/changeRequestService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "change_requests.create");
        const changeRequest = await cancelChangeRequest(actorUser, params.id);
        return apiSuccess(changeRequest, "Đã hủy yêu cầu");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
