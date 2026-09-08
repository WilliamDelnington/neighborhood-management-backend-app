import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException } from "@/lib/response";
import { workbookToXlsxResponse } from "@/lib/excelResponse";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    buildImportErrorsWorkbook,
    getImportJobById,
} from "@/services/importService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const job = await getImportJobById(params.id);
        const workbook = buildImportErrorsWorkbook(job);
        return await workbookToXlsxResponse(
            workbook,
            `import-loi-${job.type}.xlsx`,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
