import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import { exportComplaintsToExcel } from "@/services/exportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin", "neighborhood_leader");

        const { searchParams } = new URL(req.url);
        const fromDateRaw = searchParams.get("fromDate");
        const toDateRaw = searchParams.get("toDate");

        const workbook = await exportComplaintsToExcel({
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
        });

        await writeAuditLog({
            actorId: String(actorUser._id),
            action: "export.excel",
            targetModel: "Complaint",
            metadata: {
                export: "complaints",
                fromDate: fromDateRaw,
                toDate: toDateRaw,
            },
        });

        return workbookToXlsxResponse(workbook, "danh-sach-phan-anh.xlsx");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
