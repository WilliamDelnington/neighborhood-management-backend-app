import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { receivePeriodicReport } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.receive");
        return apiSuccess(await receivePeriodicReport(actorUser, params.id), "Đã tiếp nhận báo cáo");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
