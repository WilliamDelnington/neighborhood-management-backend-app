import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { confirmComplaintResolution } from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.update_own");
        const complaint = await confirmComplaintResolution(
            actorUser,
            params.id,
        );
        return apiSuccess(complaint, "Da xac nhan hoan thanh phan anh");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
