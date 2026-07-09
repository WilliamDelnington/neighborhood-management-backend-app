import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getSecurityReport,
    buildSecurityReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        // Bao cao an ninh/tam tru lien quan truc tiep den nghiep vu cua cong an khu vuc.
        requireRole(session, "admin", "neighborhood_leader", "regional_police");

        const data = await getSecurityReport();

        const { searchParams } = new URL(req.url);
        if (searchParams.get("format") === "excel") {
            const workbook = buildSecurityReportWorkbook(data);
            await writeAuditLog({
                actorId: session.userId,
                action: "report.export",
                targetModel: "Report",
                metadata: { report: "security" },
            });
            return workbookToXlsxResponse(workbook, "bao-cao-an-ninh.xlsx");
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
