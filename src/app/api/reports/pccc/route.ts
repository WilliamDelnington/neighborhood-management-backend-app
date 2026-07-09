import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
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
        const session = requireSession(req);
        // PCCC anh huong truc tiep den an toan cong dong nen cho phep ca cong an khu vuc xem.
        requireRole(session, "admin", "neighborhood_leader", "regional_police");

        const data = await getPcccReport();

        const { searchParams } = new URL(req.url);
        if (searchParams.get("format") === "excel") {
            const workbook = buildPcccReportWorkbook(data);
            await writeAuditLog({
                actorId: session.userId,
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
