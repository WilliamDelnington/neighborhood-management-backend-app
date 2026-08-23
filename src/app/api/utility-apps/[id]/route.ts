import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateUtilityAppSchema } from "@/validators/utilityApp";
import {
    deleteUtilityApp,
    getUtilityAppById,
    updateUtilityApp,
} from "@/services/utilityAppService";

export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const app = await getUtilityAppById(params.id);
        return apiSuccess(app);
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
        await requirePermission(actorUser, "utility_apps.manage");

        const body = updateUtilityAppSchema.parse(await req.json());
        const app = await updateUtilityApp(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(app, "Cập nhật tiện ích thành công");
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
        await requirePermission(actorUser, "utility_apps.manage");

        await deleteUtilityApp(String(actorUser._id), params.id);
        return apiSuccess(null, "Xóa tiện ích thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
