import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getHouseReport,
    buildHouseReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.read");

        const data = await getHouseReport();

        const { searchParams } = new URL(req.url);
        if (searchParams.get("format") === "excel") {
            const workbook = buildHouseReportWorkbook(data);
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "report.export",
                targetModel: "Report",
                metadata: { report: "houses" },
            });
            return workbookToXlsxResponse(workbook, "bao-cao-nha-so.xlsx");
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
