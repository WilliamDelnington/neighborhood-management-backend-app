import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updatePoiSchema } from "@/validators/poi";
import { deletePoi, getPoiById, updatePoi } from "@/services/poiService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "pois.read");
        const poi = await getPoiById(params.id);
        return apiSuccess(poi);
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
        await requirePermission(user, "pois.manage");
        const body = updatePoiSchema.parse(await req.json());
        const poi = await updatePoi(String(user._id), params.id, body);
        return apiSuccess(poi, "Cập nhật điểm tiện ích thành công");
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
        await requirePermission(user, "pois.manage");
        await deletePoi(params.id);
        return apiSuccess(null, "Xoá điểm tiện ích thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
