import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
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
        await requirePermission(actorUser, "complaint_types.read");
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
            "Tao loai phan anh thanh cong",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
