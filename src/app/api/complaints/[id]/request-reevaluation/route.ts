import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { requestReevaluationSchema } from "@/validators/complaint";
import { requestComplaintReevaluation } from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.update_own");
        const body = requestReevaluationSchema.parse(await req.json());
        const complaint = await requestComplaintReevaluation(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(complaint, "Đã gửi đề nghị xem xét lại");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
