import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { updatePeriodicReportSchema } from "@/validators/periodicReport";
import {
    getPeriodicReportById,
    updatePeriodicReport,
} from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const report = await getPeriodicReportById(actorUser, params.id);
        return apiSuccess(report);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.author");
        const body = updatePeriodicReportSchema.parse(await req.json());
        const report = await updatePeriodicReport(actorUser, params.id, body);
        return apiSuccess(report, "Da cap nhat bao cao");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
