import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getBusinessReport,
    buildBusinessReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.read");

        const data = await getBusinessReport();

        const { searchParams } = new URL(req.url);
        if (searchParams.get("format") === "excel") {
            const workbook = buildBusinessReportWorkbook(data);
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "report.export",
                targetModel: "Report",
                metadata: { report: "business" },
            });
            return workbookToXlsxResponse(
                workbook,
                "bao-cao-ho-kinh-doanh.xlsx",
            );
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
