import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import {
    archiveKpiDefinition,
    updateKpiDefinition,
} from "@/services/kpiService";
import { updateKpiDefinitionSchema } from "@/validators/kpiDefinition";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.kpi_manage");
        const patch = updateKpiDefinitionSchema.parse(await req.json());
        return apiSuccess(await updateKpiDefinition(actorUser, params.id, patch));
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.kpi_manage");
        return apiSuccess(await archiveKpiDefinition(actorUser, params.id));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
