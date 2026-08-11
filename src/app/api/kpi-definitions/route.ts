import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess, paginationParams } from "@/lib/response";
import {
    createKpiDefinition,
    listKpiDefinitions,
} from "@/services/kpiService";
import { createKpiDefinitionSchema } from "@/validators/kpiDefinition";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.kpi_read");
        const { searchParams } = new URL(req.url);
        const activeRaw = searchParams.get("active");
        return apiSuccess(
            await listKpiDefinitions(actorUser, {
                ...paginationParams(searchParams),
                active:
                    activeRaw === null
                        ? undefined
                        : activeRaw === "true" || activeRaw === "1",
            }),
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.kpi_manage");
        const input = createKpiDefinitionSchema.parse(await req.json());
        return apiSuccess(
            await createKpiDefinition(actorUser, input),
            "Da tao KPI",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
