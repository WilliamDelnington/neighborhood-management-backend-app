import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { Household } from "@/models";

export const dynamic = "force-dynamic";

/**
 * GET /api/households/lookup?cluster=&search=&page=&limit=
 *
 * Tra ve danh sach ho khau (phan trang) de nguoi dan chon ho cua minh khi hoan
 * tat thong tin trong Mini App (HouseholdPickerSheet).
 *
 * LUU Y ROUTING: file nay PHAI la segment tinh "lookup" de duoc uu tien hon route
 * dong "[id]" - neu khong, "/api/households/lookup" se roi vao /households/[id]
 * voi id="lookup" va gay loi CastToObjectId.
 *
 * Yeu cau dang nhap (requireUser) - luong onboarding chay sau khi da dang nhap.
 * Chi tra ve cac truong hien thi tren picker (code, address, headOfHousehold,
 * cluster) de han che lo du lieu ca nhan.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        await requireUser(req);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const cluster = searchParams.get("cluster") || undefined;
        const search = searchParams.get("search") || undefined;

        const filter: Record<string, unknown> = {};
        if (cluster) filter.cluster = cluster;
        if (search) {
            filter.$or = [
                { code: { $regex: search, $options: "i" } },
                { address: { $regex: search, $options: "i" } },
                { headOfHousehold: { $regex: search, $options: "i" } },
            ];
        }

        const [items, total] = await Promise.all([
            Household.find(filter)
                .select("code address headOfHousehold cluster")
                .sort({ code: 1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Household.countDocuments(filter),
        ]);

        return apiSuccess({
            items,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
