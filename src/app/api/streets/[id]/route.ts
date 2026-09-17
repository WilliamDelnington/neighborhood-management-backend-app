import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateStreetSchema } from "@/validators/street";
import { deleteStreet, getStreetById, updateStreet } from "@/services/streetService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "streets.read");

        const street = await getStreetById(params.id);
        return apiSuccess(street);
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
        await requirePermission(user, "streets.manage");

        const body = updateStreetSchema.parse(await req.json());
        const street = await updateStreet(String(user._id), params.id, body);
        return apiSuccess(street, "Cập nhật đường/phố thành công");
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
        await requirePermission(user, "streets.manage");

        await deleteStreet(String(user._id), params.id);
        return apiSuccess(null, "Xóa đường/phố thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
