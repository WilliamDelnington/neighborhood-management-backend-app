import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { sendCorrespondence } from "@/services/correspondenceService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "correspondences.send");
        const correspondence = await sendCorrespondence(actorUser, params.id);
        return apiSuccess(correspondence, "Gửi văn bản thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
