import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import {
    archiveComplaintTypeDefinition,
    updateComplaintTypeDefinition,
} from "@/services/complaintTypeDefinitionService";
import { updateComplaintTypeDefinitionSchema } from "@/validators/complaintTypeDefinition";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaint_types.manage");
        const input = updateComplaintTypeDefinitionSchema.parse(await req.json());
        return apiSuccess(
            await updateComplaintTypeDefinition(actorUser, params.id, input),
            "Cập nhật loại phản ánh thành công",
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
        await requirePermission(actorUser, "complaint_types.manage");
        return apiSuccess(
            await archiveComplaintTypeDefinition(actorUser, params.id),
            "Đã ngừng sử dụng loại phản ánh",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
