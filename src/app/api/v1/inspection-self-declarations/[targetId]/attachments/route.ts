import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess, HttpError } from "@/lib/response";
import { uploadHouseInspectionAttachment } from "@/services/inspectionService";

export async function POST(
    req: Request,
    { params }: { params: { targetId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const file = (await req.formData()).get("file");
        if (!(file instanceof File)) throw new HttpError("Thiếu tệp minh chứng", 400);
        return apiSuccess(
            await uploadHouseInspectionAttachment(actorUser, params.targetId, file),
            "Đã tải lên minh chứng",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
