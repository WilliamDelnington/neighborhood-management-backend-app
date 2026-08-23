import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { decideChangeRequestSchema } from "@/validators/changeRequest";
import { decideChangeRequest } from "@/services/changeRequestService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "change_requests.decide");
        const body = decideChangeRequestSchema.parse(await req.json());
        const changeRequest = await decideChangeRequest(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(
            changeRequest,
            body.approve ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
