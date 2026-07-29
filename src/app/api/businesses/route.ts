import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createBusinessSchema } from "@/validators/business";
import { createBusiness, listBusinesses } from "@/services/businessService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "businesses.create");

        const body = createBusinessSchema.parse(await req.json());
        const business = await createBusiness(user, body);
        return apiSuccess(business, "Tao ho kinh doanh thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * GET /api/businesses
 * Danh sach ho kinh doanh tren toan bo pham vi cua actor (khong gioi han
 * theo mot nha so cu the) - dung cho man "Danh sach ho kinh doanh" o Danh
 * muc. Xem listBusinesses trong businessService.ts de biet cach loc theo
 * vai tro (admin/house_owner/nhan vien).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "businesses.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listBusinesses({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
