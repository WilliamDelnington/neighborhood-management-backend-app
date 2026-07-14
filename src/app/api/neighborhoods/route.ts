import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { listNeighborhoods } from "@/services/userService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        await requireUser(req);

        const neighborhoods = await listNeighborhoods();
        return apiSuccess(neighborhoods);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
