import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createCompanySchema } from "@/validators/company";
import { createCompany, listCompanies } from "@/services/companyService";
import { VERIFICATION_STATUS, type VerificationStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "companies.create");

        const body = createCompanySchema.parse(await req.json());
        const company = await createCompany(user, body);
        return apiSuccess(company, "Tao cong ty thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * GET /api/companies
 * Danh sach cong ty tren toan bo pham vi cua actor - mirror GET /api/businesses.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "companies.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const statusParam = searchParams.get("status") || undefined;
        const status =
            statusParam &&
            (VERIFICATION_STATUS as readonly string[]).includes(statusParam)
                ? (statusParam as VerificationStatus)
                : undefined;
        const result = await listCompanies({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            status,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
