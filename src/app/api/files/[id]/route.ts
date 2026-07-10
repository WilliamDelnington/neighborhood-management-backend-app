import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { getSessionFromRequest } from "@/lib/auth";
import { requireUser, requireRole } from "@/lib/rbac";
import { updateFileAssetSchema } from "@/validators/fileAsset";

export const dynamic = "force-dynamic";
import {
    getFileAssetById,
    updateFileAsset,
    deleteFileAsset,
    STAFF_ROLES_FOR_FILE_ASSETS,
} from "@/services/fileAssetService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = getSessionFromRequest(req);
        const isStaff =
            !!session &&
            session.roles.some(r =>
                (STAFF_ROLES_FOR_FILE_ASSETS as readonly string[]).includes(r),
            );
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
        requireRole(actorUser, ...STAFF_ROLES_FOR_FILE_ASSETS);
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
        requireRole(actorUser, ...STAFF_ROLES_FOR_FILE_ASSETS);
        await deleteFileAsset(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa file thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
