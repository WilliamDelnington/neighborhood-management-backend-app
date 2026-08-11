import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { submitPeriodicReport } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const report = await submitPeriodicReport(actorUser, params.id);
        return apiSuccess(report, "Da nop bao cao");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
