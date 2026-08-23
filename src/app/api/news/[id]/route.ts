import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { updateNewsSchema } from "@/validators/news";

export const dynamic = "force-dynamic";
import { deleteNews, getNewsById, updateNews } from "@/services/newsService";

/**
 * GET cong khai: chi xem duoc tin da dang, tru khi nguoi goi co quyen news.read
 * thi duoc xem ca ban nhap.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        let isStaff = false;
        try {
            const actorUser = await requireUser(req);
            isStaff = await userHasPermission(actorUser, "news.read");
        } catch {
            isStaff = false;
        }
        const news = await getNewsById(params.id, !isStaff);
        return apiSuccess(news);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "news.update");
        const body = updateNewsSchema.parse(await req.json());
        const news = await updateNews(String(actorUser._id), params.id, body);
        return apiSuccess(news, "Cap nhat tin tuc thanh cong");
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
        await deleteNews(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa tin tuc thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
