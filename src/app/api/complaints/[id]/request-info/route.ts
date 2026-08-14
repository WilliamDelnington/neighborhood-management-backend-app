import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { requestComplaintInfoSchema } from "@/validators/complaint";
import { requestComplaintInfo } from "@/services/complaintService";

export const dynamic = "force-dynamic";

/**
 * POST /api/complaints/:id/request-info
 * Nhan vien yeu cau nguoi gui bo sung thong tin cho mot phan anh dang
 * "moi_tiep_nhan" (truoc khi tiep nhan/chon nguoi phu trach). Chuyen phan anh
 * sang "can_bo_sung", nguoi gui tu sua phan anh de bo sung.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.assign");
        const body = requestComplaintInfoSchema.parse(await req.json());
        const complaint = await requestComplaintInfo(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(complaint, "Da yeu cau bo sung thong tin");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
