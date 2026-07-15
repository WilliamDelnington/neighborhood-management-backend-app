import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import {
    getMeetingAttendanceReport,
    buildMeetingAttendanceReportWorkbook,
} from "@/services/reportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.read");

        const { searchParams } = new URL(req.url);
        const meetingId = searchParams.get("meetingId");
        if (!meetingId) {
            throw new HttpError("Thieu tham so bat buoc meetingId", 400);
        }

        const data = await getMeetingAttendanceReport({ meetingId });

        if (searchParams.get("format") === "excel") {
            const workbook = buildMeetingAttendanceReportWorkbook(data);
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "report.export",
                targetModel: "Report",
                targetId: meetingId,
                metadata: { report: "meeting_attendance" },
            });
            return workbookToXlsxResponse(
                workbook,
                "bao-cao-diem-danh-cuoc-hop.xlsx",
            );
        }

        return apiSuccess(data);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
