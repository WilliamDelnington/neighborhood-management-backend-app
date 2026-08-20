import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { removeNewsImage, uploadNewsImage } from "@/services/newsService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "news.update");
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thieu file can tai len", 400);
        }
        const isCover = formData.get("isCover") === "true";
        const news = await uploadNewsImage(actorUser, params.id, file, isCover);
        return apiSuccess(news, "Tai len anh thanh cong", 201);
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
        await requirePermission(actorUser, "news.update");
        const { searchParams } = new URL(req.url);
        const url = searchParams.get("url");
        if (!url) {
            throw new HttpError("Thieu url anh can xoa", 400);
        }
        const news = await removeNewsImage(actorUser, params.id, url);
        return apiSuccess(news, "Xoa anh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
