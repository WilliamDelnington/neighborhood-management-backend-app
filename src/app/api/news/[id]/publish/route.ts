import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { publishNews } from "@/services/newsService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "news.publish");
        const news = await publishNews(String(actorUser._id), params.id);
        return apiSuccess(news, "Dang tin tuc thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
