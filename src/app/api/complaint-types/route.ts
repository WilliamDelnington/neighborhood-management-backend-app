import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requirePermission, requireUser } from "@/lib/rbac";
import {
    apiErrorFromException,
    apiSuccess,
    paginationParams,
} from "@/lib/response";
import {
    createComplaintTypeDefinition,
    listComplaintTypeDefinitions,
} from "@/services/complaintTypeDefinitionService";
import { createComplaintTypeDefinitionSchema } from "@/validators/complaintTypeDefinition";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        // "complaint_types.read" gates the standalone management screen. The
        // resident complaint-create form (and its category picker) must also
        // be able to read this list even without that browse permission -
        // mirrors business-types/route.ts.
        await requireAnyPermission(actorUser, [
            "complaint_types.read",
            "complaints.create",
        ]);
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const activeParam = searchParams.get("active");
        return apiSuccess(
            await listComplaintTypeDefinitions({
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
        await requirePermission(actorUser, "complaint_types.manage");
        const input = createComplaintTypeDefinitionSchema.parse(await req.json());
        return apiSuccess(
            await createComplaintTypeDefinition(actorUser, input),
            "Tạo loại phản ánh thành công",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
