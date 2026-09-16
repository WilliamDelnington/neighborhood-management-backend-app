import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    removeAnnouncementGateLogo,
    uploadAnnouncementGateLogo,
} from "@/services/settingsService";

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
        const setting = await uploadAnnouncementGateLogo(String(actorUser._id), file);
        return apiSuccess(setting, "Cập nhật logo thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "settings.update");
        const setting = await removeAnnouncementGateLogo(String(actorUser._id));
        return apiSuccess(setting, "Đã xóa logo");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
