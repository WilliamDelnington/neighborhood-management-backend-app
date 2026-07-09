import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import { exportCitizensToExcel } from "@/services/exportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin", "neighborhood_leader");

        const workbook = await exportCitizensToExcel();

        await writeAuditLog({
            actorId: session.userId,
            action: "export.excel",
            targetModel: "Citizen",
            metadata: { export: "citizens" },
        });

        return workbookToXlsxResponse(workbook, "danh-sach-nhan-khau.xlsx");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
