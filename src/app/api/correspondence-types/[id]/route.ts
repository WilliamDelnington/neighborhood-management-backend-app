import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateCorrespondenceTypeSchema } from "@/validators/correspondenceType";
import {
    deleteCorrespondenceType,
    getCorrespondenceTypeById,
    updateCorrespondenceType,
} from "@/services/correspondenceTypeService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "correspondence_types.read");

        const type = await getCorrespondenceTypeById(params.id);
        return apiSuccess(type);
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
        await requirePermission(actorUser, "correspondence_types.update");

        const body = updateCorrespondenceTypeSchema.parse(await req.json());
        const type = await updateCorrespondenceType(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(type, "Cap nhat loai van ban thanh cong");
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
        await requirePermission(actorUser, "correspondence_types.delete");

        const result = await deleteCorrespondenceType(
            String(actorUser._id),
            params.id,
        );
        return apiSuccess(result, "Xoa loai van ban thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
