import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import { exportPoisToExcel } from "@/services/exportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "exports.export");

        const workbook = await exportPoisToExcel();

        await writeAuditLog({
            actorId: String(actorUser._id),
            action: "export.excel",
            targetModel: "Poi",
            metadata: { export: "pois" },
        });

        return workbookToXlsxResponse(workbook, "danh-sach-diem-tien-ich.xlsx");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
