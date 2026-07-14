import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateComplaintStatusSchema } from "@/validators/complaint";
import { updateComplaintStatus } from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.update_status");
        const body = updateComplaintStatusSchema.parse(await req.json());
        const complaint = await updateComplaintStatus(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(complaint, "Cap nhat trang thai thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
