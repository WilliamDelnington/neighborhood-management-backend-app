import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { updateComplaintStatusSchema } from "@/validators/complaint";
import {
    updateComplaintStatus,
    STAFF_ROLES_FOR_COMPLAINTS,
} from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...STAFF_ROLES_FOR_COMPLAINTS);
        const body = updateComplaintStatusSchema.parse(await req.json());
        const complaint = await updateComplaintStatus(
            session.userId,
            params.id,
            body,
        );
        return apiSuccess(complaint, "Cap nhat trang thai thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
