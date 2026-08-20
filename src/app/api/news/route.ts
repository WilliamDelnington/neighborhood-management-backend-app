import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createNewsSchema } from "@/validators/news";

export const dynamic = "force-dynamic";
import { createNews, listNews } from "@/services/newsService";

/**
 * GET cong khai: mac dinh chi tra ve tin da dang (publicOnly=true), khong yeu cau dang nhap.
 * Neu co query ?admin=1 va nguoi goi co quyen news.read thi tra ve tat ca trang thai
 * (nhap + da_dang) de admin quan ly.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);

        let publicOnly = true;
        if (searchParams.get("admin") === "1") {
            const actorUser = await requireUser(req);
            await requirePermission(actorUser, "news.read");
            publicOnly = false;
        }

        const result = await listNews({
            page,
            limit,
            status: searchParams.get("status") || undefined,
            category: searchParams.get("category") || undefined,
            publicOnly,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "news.create");
        const body = createNewsSchema.parse(await req.json());
        const news = await createNews(actorUser, body);
        return apiSuccess(news, "Tao tin tuc thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
