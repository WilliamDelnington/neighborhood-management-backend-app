import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { removeAppFavicon, uploadAppFavicon } from "@/services/settingsService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "settings.update");
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thieu file can tai len", 400);
        }
        const setting = await uploadAppFavicon(String(actorUser._id), file);
        return apiSuccess(setting, "Cập nhật biểu tượng tab thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "settings.update");
        const setting = await removeAppFavicon(String(actorUser._id));
        return apiSuccess(setting, "Đã xóa biểu tượng tab, quay về mặc định");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
