import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    assertPcccCheckInScope,
    getPcccCheckById,
    listPcccAttachments,
    uploadPcccAttachment,
} from "@/services/pcccService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "pccc.read");
        const check = await getPcccCheckById(params.id);
        assertPcccCheckInScope(actorUser, check);
        const attachments = await listPcccAttachments(params.id);
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
        await requirePermission(actorUser, "pccc.update");
        const check = await getPcccCheckById(params.id);
        assertPcccCheckInScope(actorUser, check);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
            throw new HttpError("Vui long chon file de tai len", 400);
        }

        const fileAsset = await uploadPcccAttachment(
            String(actorUser._id),
            params.id,
            file,
        );
        return apiSuccess(fileAsset, "Tai len file dinh kem thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
