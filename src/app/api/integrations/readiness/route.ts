import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getDigitalReadiness } from "@/services/digitalReadinessService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "settings.read");
        return apiSuccess(await getDigitalReadiness());
    } catch (err) {
        return apiErrorFromException(err);
    }
}

