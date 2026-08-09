import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getPcccReport,
    buildPcccReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        // PCCC anh huong truc tiep den an toan cong dong nen cho phep ca cong an khu vuc xem.
        await requirePermission(actorUser, "reports.read");

        const { searchParams } = new URL(req.url);
        const fromDateRaw = searchParams.get("fromDate");
        const toDateRaw = searchParams.get("toDate");

        const data = await getPcccReport(actorUser, {
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
        });

        if (searchParams.get("format") === "excel") {
            const workbook = buildPcccReportWorkbook(data);
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "report.export",
                targetModel: "Report",
                metadata: { report: "pccc" },
            });
            return workbookToXlsxResponse(workbook, "bao-cao-pccc.xlsx");
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
