import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateBusinessSchema } from "@/validators/business";
import {
    getBusinessById,
    updateBusiness,
    deleteBusiness,
} from "@/services/businessService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "businesses.read");

        const business = await getBusinessById(params.id);
        return apiSuccess(business);
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
        const user = await requireUser(req);
        await requirePermission(user, "businesses.update");

        const body = updateBusinessSchema.parse(await req.json());
        const business = await updateBusiness(user, params.id, body);
        return apiSuccess(business, "Cap nhat ho kinh doanh thanh cong");
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
        const user = await requireUser(req);
        await requirePermission(user, "businesses.delete");

        await deleteBusiness(String(user._id), params.id);
        return apiSuccess(null, "Xoa ho kinh doanh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
