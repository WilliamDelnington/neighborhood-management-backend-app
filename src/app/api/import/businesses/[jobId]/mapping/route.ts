import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { businessImportMappingSchema } from "@/validators/importExport";
import { applyBusinessImportMapping } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function PUT(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const body = businessImportMappingSchema.parse(await req.json());
        const job = await applyBusinessImportMapping(params.jobId, body);
        return apiSuccess(
            job,
            "Đã áp dụng cấu hình cột, vui lòng xem trước kết quả trước khi commit",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
