import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { deletePeriodicReportAttachment } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.author");
        await deletePeriodicReportAttachment(actorUser, params.id, params.fileId);
        return apiSuccess(null, "Đã xóa tệp đính kèm");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
