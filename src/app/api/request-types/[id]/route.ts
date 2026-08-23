import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import {
    archiveRequestTypeDefinition,
    updateRequestTypeDefinition,
} from "@/services/requestTypeDefinitionService";
import { updateRequestTypeDefinitionSchema } from "@/validators/requestTypeDefinition";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "request_types.manage");
        const input = updateRequestTypeDefinitionSchema.parse(await req.json());
        return apiSuccess(
            await updateRequestTypeDefinition(actorUser, params.id, input),
            "Cập nhật loại nhiệm vụ thành công",
        );
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
        await requirePermission(actorUser, "request_types.manage");
        return apiSuccess(
            await archiveRequestTypeDefinition(actorUser, params.id),
            "Đã ngừng sử dụng loại nhiệm vụ",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}

