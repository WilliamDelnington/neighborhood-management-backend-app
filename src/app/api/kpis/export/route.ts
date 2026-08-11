import { connectDB } from "@/lib/mongodb";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { createAnalyticsPdfBuffer, pdfDownloadResponse } from "@/lib/pdfExport";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import {
    buildKpiWorkbook,
    getKpiExportData,
} from "@/services/kpiService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.kpi_read");
        await requirePermission(actorUser, "reports.export");
        const { searchParams } = new URL(req.url);
        const fromDateRaw = searchParams.get("fromDate");
        const toDateRaw = searchParams.get("toDate");
        const format = searchParams.get("format") === "excel" ? "excel" : "pdf";
        const options = {
            fromDate: fromDateRaw ? new Date(fromDateRaw) : undefined,
            toDate: toDateRaw ? new Date(toDateRaw) : undefined,
            neighborhoodId: searchParams.get("neighborhoodId") || undefined,
        };
        const data = await getKpiExportData(actorUser, options);
        await writeAuditLog({
            actorId: actorUser._id,
            action: "DATA_EXPORTED",
            targetModel: "KpiDefinition",
            metadata: {
                format,
                fromDate: fromDateRaw,
                toDate: toDateRaw,
                neighborhoodId: options.neighborhoodId,
            },
        });
        if (format === "excel") {
            return workbookToXlsxResponse(buildKpiWorkbook(data), "bao-cao-kpi.xlsx");
        }
        const printable = {
            kpis: data.items.map(item => ({
                code: item.definition.code,
                name: item.definition.name,
                value: item.value,
                unit: item.definition.unit,
                target: `${item.definition.targetDirection === "gte" ? ">=" : "<="} ${item.definition.targetValue}`,
                targetMet: item.targetMet,
                detail: item.detail,
            })),
        };
        return pdfDownloadResponse(
            await createAnalyticsPdfBuffer("Báo cáo KPI Phường", printable, options),
            "bao-cao-kpi.pdf",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
