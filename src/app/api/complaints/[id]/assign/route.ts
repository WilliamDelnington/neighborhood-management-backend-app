import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { assignComplaintSchema } from "@/validators/complaint";
import {
    assignComplaint,
    STAFF_ROLES_FOR_COMPLAINTS,
} from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, ...STAFF_ROLES_FOR_COMPLAINTS);
        const body = assignComplaintSchema.parse(await req.json());
        const complaint = await assignComplaint(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(complaint, "Phan cong xu ly thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
