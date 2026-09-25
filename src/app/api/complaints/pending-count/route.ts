import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { countPendingComplaints } from "@/services/complaintService";

export const dynamic = "force-dynamic";

/**
 * GET /api/complaints/pending-count
 * So phan anh dang cho xu ly (pham vi "Nhận từ cư dân") cua nguoi dang nhap -
 * dung cho badge so luong canh muc "Phản ánh" tren menu, cung quy uoc voi
 * /api/requests/my/pending-count.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.read");
        const canReadEscalated = await userHasPermission(
            actorUser,
            "complaints.read_escalated",
        );
        const count = await countPendingComplaints(actorUser, canReadEscalated);
        return apiSuccess({ count });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
