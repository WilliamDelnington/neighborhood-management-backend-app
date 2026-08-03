import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { streetImportMappingSchema } from "@/validators/importExport";
import { applyStreetImportMapping } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function PUT(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const body = streetImportMappingSchema.parse(await req.json());
        const job = await applyStreetImportMapping(params.jobId, body);
        return apiSuccess(
            job,
            "Da ap dung cau hinh cot, vui long xem truoc ket qua truoc khi commit",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
