import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requireAnyPermission, requirePermission } from "@/lib/rbac";
import { createCompanyTypeSchema } from "@/validators/companyType";
import {
    createCompanyType,
    listCompanyTypes,
} from "@/services/companyTypeService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        // "company_types.read" gates the standalone browsable list page.
        // Nhung ho so tao/sua cong ty (chon loai hinh qua picker) van phai
        // goi duoc API nay du admin da tat quyen browse rieng cho house_owner
        // - neu khong picker se luon rong va khong ai chon duoc loai hinh khi
        // tao/sua (giong ly do cua business-types).
        await requireAnyPermission(actorUser, [
            "company_types.read",
            "companies.create",
            "companies.update",
        ]);

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || undefined;
        const activeParam = searchParams.get("active");
        const active =
            activeParam === null
                ? undefined
                : activeParam === "1" || activeParam === "true";
        const { page, limit } = paginationParams(searchParams);

        const result = await listCompanyTypes({ search, active, page, limit });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "company_types.create");

        const body = createCompanyTypeSchema.parse(await req.json());
        const companyType = await createCompanyType(
            String(actorUser._id),
            body,
        );
        return apiSuccess(companyType, "Tạo loại hình doanh nghiệp thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
