import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import {
    getNeighborhoodById,
    updateNeighborhoodTerm,
} from "@/services/neighborhoodService";
import { updateNeighborhoodTermSchema } from "@/validators/neighborhood";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string; termId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const body = updateNeighborhoodTermSchema.parse(await req.json());
        const term = await updateNeighborhoodTerm(
            String(user._id),
            params.id,
            params.termId,
            body,
        );
        return apiSuccess(term, "Cập nhật nhiệm kỳ thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
