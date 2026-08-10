import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, userHasPermission } from "@/lib/rbac";
import { getChangeRequestById } from "@/services/changeRequestService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const changeRequest = await getChangeRequestById(params.id);
        const isStaff = await userHasPermission(actorUser, "change_requests.read");
        const requestedById =
            typeof changeRequest.requestedBy === "object" &&
            changeRequest.requestedBy !== null &&
            "_id" in changeRequest.requestedBy
                ? String((changeRequest.requestedBy as { _id: unknown })._id)
                : String(changeRequest.requestedBy);
        if (!isStaff && requestedById !== String(actorUser._id)) {
            throw new HttpError("Ban khong co quyen xem yeu cau nay", 403);
        }
        return apiSuccess(changeRequest);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
