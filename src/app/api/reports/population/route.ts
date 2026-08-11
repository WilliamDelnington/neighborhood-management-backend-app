import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getPopulationReport,
    buildPopulationReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.read");

        const { searchParams } = new URL(req.url);
        const fromDateRaw = searchParams.get("fromDate");
        const toDateRaw = searchParams.get("toDate");

        const data = await getPopulationReport(actorUser, {
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
        });

        if (searchParams.get("format") === "excel") {
            await requirePermission(actorUser, "reports.export");
            const workbook = buildPopulationReportWorkbook(data);
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "DATA_EXPORTED",
                targetModel: "Report",
                metadata: { report: "population" },
            });
            return workbookToXlsxResponse(workbook, "bao-cao-dan-cu.xlsx");
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
