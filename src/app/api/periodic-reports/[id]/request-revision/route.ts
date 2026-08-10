import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { requestPeriodicReportRevisionSchema } from "@/validators/periodicReport";
import { requestPeriodicReportRevision } from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = requestPeriodicReportRevisionSchema.parse(
            await req.json(),
        );
        const report = await requestPeriodicReportRevision(
            actorUser,
            params.id,
            body.note,
        );
        return apiSuccess(report, "Da gui yeu cau bo sung");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
