import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import {
    getRequestById,
    listRequestAttachments,
    uploadRequestAttachment,
} from "@/services/requestService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        // getRequestById da kiem tra quyen xem (quan ly hoac nguoi nhan).
        await getRequestById(actorUser, params.id);
        const attachments = await listRequestAttachments(params.id);
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
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thieu file can tai len", 400);
        }
        const fileAsset = await uploadRequestAttachment(
            actorUser,
            params.id,
            file,
        );
        return apiSuccess(fileAsset, "Tai len file dinh kem thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
