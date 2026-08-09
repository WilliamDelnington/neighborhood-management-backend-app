import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { fetchWardsByProvince } from "@/lib/administrativeDivisions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        await requireUser(req);

        const { searchParams } = new URL(req.url);
        const provinceCode = Number(searchParams.get("provinceCode"));
        if (!provinceCode || Number.isNaN(provinceCode)) {
            throw new HttpError("Thieu hoac sai provinceCode", 422);
        }

        const wards = await fetchWardsByProvince(provinceCode);
        return apiSuccess(wards);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
