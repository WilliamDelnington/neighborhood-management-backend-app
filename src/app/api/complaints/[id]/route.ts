import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import {
    getComplaintDetailForOwnerOrStaff,
    STAFF_ROLES_FOR_COMPLAINTS,
} from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const isStaff = actorUser.roles.some(r =>
            (STAFF_ROLES_FOR_COMPLAINTS as readonly string[]).includes(r),
        );
        const result = await getComplaintDetailForOwnerOrStaff(params.id, {
            userId: String(actorUser._id),
            isStaff,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
