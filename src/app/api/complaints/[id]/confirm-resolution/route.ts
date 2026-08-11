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
        // Danh gia (rating/ratingNote) la tuy chon - body co the rong nhu
        // truoc day, khong bat buoc phai gui.
        let body: { rating?: number; ratingNote?: string } = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }
        const complaint = await confirmComplaintResolution(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(complaint, "Da xac nhan hoan thanh phan anh");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
