import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import { exportHouseholdsToExcel } from "@/services/exportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin", "neighborhood_leader");

        const workbook = await exportHouseholdsToExcel();

        await writeAuditLog({
            actorId: String(actorUser._id),
            action: "export.excel",
            targetModel: "Household",
            metadata: { export: "households" },
        });

        return workbookToXlsxResponse(workbook, "danh-sach-ho-dan.xlsx");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
