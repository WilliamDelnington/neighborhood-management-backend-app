import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission, userHasPermission } from "@/lib/rbac";
import { createUtilityAppSchema } from "@/validators/utilityApp";
import { createUtilityApp, listUtilityApps } from "@/services/utilityAppService";

export const dynamic = "force-dynamic";

// GET la endpoint cong khai (resident-web-app hien thi "Nhom tien ich" tren
// trang chu khong can quyen rieng) - chi tra ve muc active=true. Admin co
// quyen "utility_apps.manage" truyen ?admin=1 de xem ca muc dang tat (man
// quan tri "Nhom tien ich").
export async function GET(req: Request) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);

        let isAdminView = false;
        if (searchParams.get("admin") === "1") {
            try {
                const actorUser = await requireUser(req);
                isAdminView = await userHasPermission(
                    actorUser,
                    "utility_apps.manage",
                );
            } catch {
                isAdminView = false;
            }
        }

        const result = await listUtilityApps({
            activeOnly: !isAdminView,
            page,
            limit,
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
        await requirePermission(actorUser, "utility_apps.manage");

        const body = createUtilityAppSchema.parse(await req.json());
        const app = await createUtilityApp(String(actorUser._id), body);
        return apiSuccess(app, "Them tien ich thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
