import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { updateRequestFormData } from "@/services/requestService";
import { updateRequestFormDataSchema } from "@/validators/request";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = updateRequestFormDataSchema.parse(await req.json());
        return apiSuccess(
            await updateRequestFormData(actorUser, params.id, input.formData),
            "Lưu dữ liệu biểu mẫu thành công",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}

