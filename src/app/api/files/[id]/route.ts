import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { updateFileAssetSchema } from "@/validators/fileAsset";

export const dynamic = "force-dynamic";
import {
    getFileAssetById,
    updateFileAsset,
    deleteFileAsset,
} from "@/services/fileAssetService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        let actorUser = null;
        try {
            actorUser = await requireUser(req);
        } catch {
            actorUser = null;
        }
        const isStaff = actorUser
            ? await userHasPermission(actorUser, "files.read")
            : false;
        // Nhan vien co quyen files.read xem duoc de quan ly, bat ke targetRoles.
        const viewerRoles = isStaff ? null : actorUser?.roles || [];
        const fileAsset = await getFileAssetById(
            params.id,
            !isStaff,
            viewerRoles,
        );
        return apiSuccess(fileAsset);
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
        await requirePermission(actorUser, "files.update");
        const body = updateFileAssetSchema.parse(await req.json());
        const fileAsset = await updateFileAsset(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(fileAsset, "Cap nhat file thanh cong");
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
        await requirePermission(actorUser, "files.delete");
        await deleteFileAsset(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa file thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
