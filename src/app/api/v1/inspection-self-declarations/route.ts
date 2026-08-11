import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { listMyInspectionSelfDeclarations } from "@/services/inspectionService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        return apiSuccess(await listMyInspectionSelfDeclarations(actorUser));
    } catch (err) {
        return apiErrorFromException(err);
    }
}
