import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { houseImportMappingSchema } from "@/validators/importExport";
import { applyHouseImportMapping } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function PUT(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const body = houseImportMappingSchema.parse(await req.json());
        const job = await applyHouseImportMapping(params.jobId, body);
        return apiSuccess(
            job,
            "Đã áp dụng cấu hình cột, vui lòng xem trước kết quả trước khi commit",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
