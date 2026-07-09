import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { getImportJobById } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin", "neighborhood_leader");

        const job = await getImportJobById(params.id);
        return apiSuccess(job);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
