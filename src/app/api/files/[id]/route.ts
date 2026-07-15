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
        let isStaff = false;
        try {
            const actorUser = await requireUser(req);
            isStaff = await userHasPermission(actorUser, "files.read");
        } catch {
            isStaff = false;
        }
        const fileAsset = await getFileAssetById(params.id, !isStaff);
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
