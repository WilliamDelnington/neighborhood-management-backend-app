import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getFinanceReport,
    buildFinanceReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        // Tai chinh la du lieu nhay cam nhat -> chi admin duoc xem bao cao tong hop.
        requireRole(session, "admin");

        const { searchParams } = new URL(req.url);
        const fromDateRaw = searchParams.get("fromDate");
        const toDateRaw = searchParams.get("toDate");

        const data = await getFinanceReport({
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
        });

        if (searchParams.get("format") === "excel") {
            const workbook = buildFinanceReportWorkbook(data);
            await writeAuditLog({
                actorId: session.userId,
                action: "report.export",
                targetModel: "Report",
                metadata: {
                    report: "finance",
                    fromDate: fromDateRaw,
                    toDate: toDateRaw,
                },
            });
            return workbookToXlsxResponse(workbook, "bao-cao-tai-chinh.xlsx");
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
