import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException } from "@/lib/response";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { requireUser, requirePermission } from "@/lib/rbac";
import { buildStreetImportTemplateWorkbook } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const workbook = buildStreetImportTemplateWorkbook();
        return await workbookToXlsxResponse(
            workbook,
            "mau-nhap-duong-pho.xlsx",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
