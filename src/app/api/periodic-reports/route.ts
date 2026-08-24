import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createPeriodicReportSchema } from "@/validators/periodicReport";
import {
    createPeriodicReport,
    listMyPeriodicReports,
    listReceivedPeriodicReports,
} from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

/**
 * GET /api/periodic-reports?view=mine|received
 * "mine" (mac dinh): bao cao do actor tu soan. "received": bao cao gui CHO
 * actor (submittedToUserId = actor) - khong can permission rieng, ai cung
 * xem duoc bao cao gui cho chinh minh.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const view = searchParams.get("view") === "received" ? "received" : "mine";
        const status = searchParams.get("status") || undefined;

        const result =
            view === "received"
                ? await listReceivedPeriodicReports(actorUser, { page, limit, status })
                : await listMyPeriodicReports(actorUser, { page, limit, status });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.author");

        const body = createPeriodicReportSchema.parse(await req.json());
        const report = await createPeriodicReport(actorUser, body);
        return apiSuccess(report, "Đã tạo báo cáo", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
