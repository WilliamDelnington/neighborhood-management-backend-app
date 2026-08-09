import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { updateRequestSchema } from "@/validators/request";
import {
    cancelRequest,
    getRequestById,
    updateRequest,
} from "@/services/requestService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const request = await getRequestById(actorUser, params.id);
        return apiSuccess(request);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = updateRequestSchema.parse(await req.json());
        const request = await updateRequest(actorUser, params.id, body);
        return apiSuccess(request, "Cap nhat yeu cau thanh cong");
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
        await cancelRequest(actorUser, params.id);
        return apiSuccess(null, "Huy yeu cau thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
