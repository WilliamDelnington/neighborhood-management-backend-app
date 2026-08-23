import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    listInfrastructureAssetAttachments,
    uploadInfrastructureAssetAttachment,
} from "@/services/infrastructureAssetService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "infrastructure.read");
        const attachments = await listInfrastructureAssetAttachments(
            actorUser,
            params.id,
        );
        return apiSuccess(attachments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "infrastructure.manage");
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thieu file can tai len", 400);
        }
        const fileAsset = await uploadInfrastructureAssetAttachment(
            actorUser,
            params.id,
            file,
        );
        return apiSuccess(fileAsset, "Tải lên file đính kèm thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
