import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess, HttpError } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { uploadUtilityAppIcon } from "@/services/utilityAppService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "utility_apps.manage");

        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thieu anh can tai len", 400);
        }
        const result = await uploadUtilityAppIcon(String(actorUser._id), file, req);
        return apiSuccess(result, "Tải icon thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
