import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getComplaintReport,
    buildComplaintReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin", "neighborhood_leader");

        const { searchParams } = new URL(req.url);
        const fromDateRaw = searchParams.get("fromDate");
        const toDateRaw = searchParams.get("toDate");

        const data = await getComplaintReport({
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
        });

        if (searchParams.get("format") === "excel") {
            const workbook = buildComplaintReportWorkbook(data);
            await writeAuditLog({
                actorId: session.userId,
                action: "report.export",
                targetModel: "Report",
                metadata: {
                    report: "complaints",
                    fromDate: fromDateRaw,
                    toDate: toDateRaw,
                },
            });
            return workbookToXlsxResponse(workbook, "bao-cao-phan-anh.xlsx");
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
