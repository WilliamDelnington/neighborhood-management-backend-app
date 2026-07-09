import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
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
        const session = requireSession(req);
        requireRole(session, "admin", "neighborhood_leader");

        const data = await getPopulationReport();

        const { searchParams } = new URL(req.url);
        if (searchParams.get("format") === "excel") {
            const workbook = buildPopulationReportWorkbook(data);
            await writeAuditLog({
                actorId: session.userId,
                action: "report.export",
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
