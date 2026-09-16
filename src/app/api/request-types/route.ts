import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requirePermission, requireUser } from "@/lib/rbac";
import {
    apiErrorFromException,
    apiSuccess,
    paginationParams,
} from "@/lib/response";
import {
    createRequestTypeDefinition,
    listRequestTypeDefinitions,
} from "@/services/requestTypeDefinitionService";
import { createRequestTypeDefinitionSchema } from "@/validators/requestTypeDefinition";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        // "request_types.read" gates the standalone management screen. The
        // "create new request" form (and its type picker) must also be able
        // to read this list even without that browse permission - mirrors
        // complaint-types/route.ts and business-types/route.ts.
        await requireAnyPermission(actorUser, [
            "request_types.read",
            "requests.create",
        ]);
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const activeParam = searchParams.get("active");
        return apiSuccess(
            await listRequestTypeDefinitions({
                actorUser,
                page,
                limit,
                search: searchParams.get("search") || undefined,
                active:
                    activeParam === null
                        ? undefined
                        : activeParam === "true" || activeParam === "1",
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
        await requirePermission(actorUser, "request_types.manage");
        const input = createRequestTypeDefinitionSchema.parse(await req.json());
        return apiSuccess(
            await createRequestTypeDefinition(actorUser, input),
            "Tạo loại nhiệm vụ thành công",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}

