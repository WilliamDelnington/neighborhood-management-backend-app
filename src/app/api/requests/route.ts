import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { createRequestSchema } from "@/validators/request";
import { createRequest, listRequests } from "@/services/requestService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "requests.create");
        const body = createRequestSchema.parse(await req.json());
        const request = await createRequest(actorUser, body);
        return apiSuccess(request, "Gửi yêu cầu thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "requests.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const view = searchParams.get("view");
        const result = await listRequests({
            actorUser,
            page,
            limit,
            type: searchParams.get("type") || undefined,
            relatedModel: searchParams.get("relatedModel") || undefined,
            relatedId: searchParams.get("relatedId") || undefined,
            houseId: searchParams.get("houseId") || undefined,
            view: view === "sent" ? "sent" : undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
