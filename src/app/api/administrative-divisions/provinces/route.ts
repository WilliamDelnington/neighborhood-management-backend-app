import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { fetchProvinces } from "@/lib/administrativeDivisions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        await requireUser(req);
        const provinces = await fetchProvinces();
        return apiSuccess(provinces);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
