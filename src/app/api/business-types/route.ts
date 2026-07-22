import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createBusinessTypeSchema } from "@/validators/businessType";
import {
    createBusinessType,
    listBusinessTypes,
} from "@/services/businessTypeService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "business_types.read");

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || undefined;
        const activeParam = searchParams.get("active");
        const active =
            activeParam === null
                ? undefined
                : activeParam === "1" || activeParam === "true";
        const { page, limit } = paginationParams(searchParams);

        const result = await listBusinessTypes({ search, active, page, limit });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "business_types.create");

        const body = createBusinessTypeSchema.parse(await req.json());
        const businessType = await createBusinessType(
            String(actorUser._id),
            body,
        );
        return apiSuccess(businessType, "Tao loai hinh kinh doanh thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
