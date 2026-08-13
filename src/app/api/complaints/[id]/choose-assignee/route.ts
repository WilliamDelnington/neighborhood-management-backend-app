import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { chooseAssigneeSchema } from "@/validators/complaint";
import { choosePersonInCharge } from "@/services/complaintService";

export const dynamic = "force-dynamic";

/**
 * POST /api/complaints/:id/choose-assignee
 * Nhan vien chon MOT nguoi khac lam nguoi phu trach chinh cho mot phan anh
 * dang "moi_tiep_nhan". Khac /receive (tu tiep nhan cho chinh minh) va
 * /assign (tai phan cong/chuyen trach nhiem sau khi da qua buoc tiep nhan
 * dau tien).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.assign");
        const body = chooseAssigneeSchema.parse(await req.json());
        const complaint = await choosePersonInCharge(
            actorUser,
            params.id,
            body.userId,
        );
        return apiSuccess(complaint, "Da chon nguoi phu trach");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
