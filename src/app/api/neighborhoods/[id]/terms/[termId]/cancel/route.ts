import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import {
    cancelNeighborhoodTerm,
    getNeighborhoodById,
} from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

// Huy mot nhiem ky CHUA bat dau (NOT_STARTED -> CANCELLED) - khong can ly do,
// xem cancelNeighborhoodTerm.
export async function POST(
    req: Request,
    { params }: { params: { id: string; termId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const term = await cancelNeighborhoodTerm(
            String(user._id),
            params.id,
            params.termId,
        );
        return apiSuccess(term, "Đã hủy nhiệm kỳ");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
