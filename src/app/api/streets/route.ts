import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createStreetSchema } from "@/validators/street";
import { createStreet, listStreets } from "@/services/streetService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "streets.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const activeParam = searchParams.get("active");
        const result = await listStreets({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            active: activeParam === null ? undefined : activeParam === "true",
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "streets.manage");

        const body = createStreetSchema.parse(await req.json());
        const street = await createStreet(String(user._id), body);
        return apiSuccess(street, "Tao duong/pho thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
