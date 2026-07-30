import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requireAnyPermission, requirePermission } from "@/lib/rbac";
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
        // "business_types.read" gates the standalone browsable list page.
        // Nhung ho so tao/sua ho kinh doanh (chon loai hinh qua picker) van
        // phai goi duoc API nay du admin da tat quyen browse rieng cho
        // house_owner - neu khong picker se luon rong va khong ai chon duoc
        // loai hinh khi tao/sua.
        await requireAnyPermission(actorUser, [
            "business_types.read",
            "businesses.create",
            "businesses.update",
        ]);

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
