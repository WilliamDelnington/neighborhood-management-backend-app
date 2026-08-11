import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess, HttpError } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { FileAsset, NeighborhoodHistory } from "@/models";
import { deleteFileAsset } from "@/services/fileAssetService";
import { getNeighborhoodById } from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const belongs = await FileAsset.exists({
            _id: params.fileId,
            relatedModel: "Neighborhood",
            relatedId: params.id,
        });
        if (!belongs) throw new HttpError("Khong tim thay tai lieu", 404);
        await deleteFileAsset(String(user._id), params.fileId);
        await NeighborhoodHistory.create({
            neighborhoodId: params.id,
            actorId: user._id,
            action: "ATTACHMENT_REMOVED",
            metadata: { fileId: params.fileId },
        });
        return apiSuccess(null, "Da xoa tai lieu dinh kem");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
