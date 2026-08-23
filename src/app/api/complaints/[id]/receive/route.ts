import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { receiveComplaint } from "@/services/complaintService";

export const dynamic = "force-dynamic";

/**
 * POST /api/complaints/:id/receive
 * Nhan vien tu tiep nhan mot phan anh dang "moi_tiep_nhan" - tro thanh nguoi
 * phu trach chinh CUA CHINH MINH. Khac /assign (chon/doi nguoi phu trach cho
 * NGUOI KHAC, dung cho tai phan cong sau nay).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.assign");
        const complaint = await receiveComplaint(actorUser, params.id);
        return apiSuccess(complaint, "Đã tiếp nhận phản ánh");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
