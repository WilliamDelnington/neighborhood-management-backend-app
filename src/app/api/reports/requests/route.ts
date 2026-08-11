import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    buildRequestReportWorkbook,
    getRequestReport,
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
        const data = await getRequestReport(actorUser, {
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
        });
        if (searchParams.get("format") === "excel") {
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "report.export",
                targetModel: "Report",
                metadata: { report: "requests" },
            });
            return workbookToXlsxResponse(
                buildRequestReportWorkbook(data),
                "bao-cao-yeu-cau-cong-viec.xlsx",
            );
        }
        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
