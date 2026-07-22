import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createBusinessSchema } from "@/validators/business";
import { createBusiness } from "@/services/businessService";

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
