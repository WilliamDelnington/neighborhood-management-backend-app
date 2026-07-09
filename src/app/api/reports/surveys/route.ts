import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";

export const dynamic = "force-dynamic";
import {
    getSurveyResultReport,
    buildSurveyResultReportWorkbook,
} from "@/services/reportService";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin", "neighborhood_leader");

        const { searchParams } = new URL(req.url);
        const surveyId = searchParams.get("surveyId");
        if (!surveyId) {
            throw new HttpError("Thieu tham so bat buoc surveyId", 400);
        }

        const data = await getSurveyResultReport({ surveyId });

        if (searchParams.get("format") === "excel") {
            const workbook = buildSurveyResultReportWorkbook(data);
            await writeAuditLog({
                actorId: session.userId,
                action: "report.export",
                targetModel: "Report",
                targetId: surveyId,
                metadata: { report: "survey_results" },
            });
            return workbookToXlsxResponse(workbook, "bao-cao-khao-sat.xlsx");
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
