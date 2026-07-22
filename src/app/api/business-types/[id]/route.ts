import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateBusinessTypeSchema } from "@/validators/businessType";
import {
    deleteBusinessType,
    getBusinessTypeById,
    updateBusinessType,
} from "@/services/businessTypeService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "business_types.read");

        const businessType = await getBusinessTypeById(params.id);
        return apiSuccess(businessType);
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
        await requirePermission(actorUser, "business_types.update");

        const body = updateBusinessTypeSchema.parse(await req.json());
        const businessType = await updateBusinessType(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(businessType, "Cap nhat loai hinh kinh doanh thanh cong");
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
        await requirePermission(actorUser, "business_types.delete");

        const result = await deleteBusinessType(
            String(actorUser._id),
            params.id,
        );
        return apiSuccess(result, "Xoa loai hinh kinh doanh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
