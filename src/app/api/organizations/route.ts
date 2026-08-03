import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createOrganizationSchema } from "@/validators/organization";
import {
    createOrganization,
    listOrganizations,
} from "@/services/organizationService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "organizations.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const activeParam = searchParams.get("active");
        const result = await listOrganizations({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            active: activeParam === null ? undefined : activeParam === "true",
            actorUser: user,
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
        await requirePermission(user, "organizations.create");

        const body = createOrganizationSchema.parse(await req.json());
        const organization = await createOrganization(user, body);
        return apiSuccess(organization, "Tao to chuc thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
