import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import type { IUser } from "@/models";
import { createAnnouncementSchema } from "@/validators/announcement";

export const dynamic = "force-dynamic";
import {
    createAnnouncement,
    listAnnouncements,
} from "@/services/announcementService";

/**
 * GET cong khai: mac dinh chi tra ve thong bao da dang (publicOnly=true), khong yeu cau dang nhap.
 * Neu co query ?admin=1 va nguoi goi la nhan vien (admin/secretary/neighborhood_leader) thi
 * tra ve tat ca trang thai (nhap + da_dang) de admin quan ly.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);

        let publicOnly = true;
        let actorUser: IUser | undefined;
        if (searchParams.get("admin") === "1") {
            actorUser = await requireUser(req);
            await requirePermission(actorUser, "announcements.read");
            publicOnly = false;
        }

        const result = await listAnnouncements({
            page,
            limit,
            status: searchParams.get("status") || undefined,
            category: searchParams.get("category") || undefined,
            publicOnly,
            actorUser,
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
        await requirePermission(actorUser, "announcements.create");
        const body = createAnnouncementSchema.parse(await req.json());
        const announcement = await createAnnouncement(actorUser, body);
        return apiSuccess(announcement, "Tao thong bao thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
